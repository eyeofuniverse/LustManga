import { prisma, db } from "@/lib/db";
import { pool } from "@/lib/http";
import { classify } from "@/lib/safety/classify";
import { loadTerms } from "@/lib/safety/load-terms";
import { slug, upsertTags } from "@/lib/tags";
import { attachSource, findDuplicate, findSimilar, normTitle, recordCandidate } from "@/lib/dedupe";
import * as hm from "@/lib/sources/hitomi";
import type { HGallery } from "@/lib/sources/hitomi";
import {
  Budget,
  MAX_ATTEMPTS,
  beginRun,
  emptyStats,
  endRun,
  finalizeWork,
  storeChapterPages,
  storeCover,
  type IngestStats,
} from "@/lib/ingest/shared";

export interface HitomiOptions {
  /** popular = most-read of the year (resumable cursor), recent = newest uploads, retry = re-fetch failed galleries */
  mode: "popular" | "recent" | "retry";
  /** stop after this many NEW works */
  limit: number;
  maxMinutes: number;
  /** our language codes, e.g. ["en","ja"]; empty = English only */
  langs: string[];
  /** skip galleries bigger than this (huge image sets); raise it to take them */
  maxPages: number;
  dryRun: boolean;
  log: (m: string) => void;
}

const CHUNK = 100;
const PAGE_CONCURRENCY = Number(process.env.HITOMI_PAGE_CONCURRENCY) || 8;
const GALLERY_CONCURRENCY = Number(process.env.HITOMI_GALLERY_CONCURRENCY) || 3;

type Ctx = { o: HitomiOptions; stats: IngestStats; budget: Budget; created: { n: number; cap: number } };

/** Ingest one gallery. Creates the Work on first sight; on a retry it just finishes the missing chapter. */
async function processGallery(id: number, seed: number, c: Ctx): Promise<void> {
  const { o, stats, budget } = c;
  const info = await hm.getGallery(id).catch((e) => {
    stats.errors.push(`gallery ${id}: ${(e as Error).message}`);
    return null;
  });
  if (!info) return;
  stats.worksSeen++;
  if (info.blocked) return void o.log(`  ${id} blocked upstream, skipped`);
  if (!info.files?.length) return void o.log(`  ${id} no files, skipped`);
  if (info.files.length > o.maxPages) return void o.log(`  ${id} ${info.files.length} pages > max-pages ${o.maxPages}, skipped`);

  const n = hm.names(info);
  const verdict = classify(
    { title: info.title, altTitles: info.japanese_title ? [info.japanese_title] : [], description: null, tags: n.tags },
    await loadTerms(),
  );

  if (verdict.verdict === "QUARANTINE") {
    stats.worksSuppressed++;
    o.log(`  ${id} QUARANTINED (${verdict.reasons.join(", ")}) - metadata only`);
    if (!o.dryRun)
      await db(() =>
        prisma.suppressedSource.upsert({
          where: { site_externalId: { site: hm.SITE, externalId: String(id) } },
          create: { site: hm.SITE, externalId: String(id), title: info.title.slice(0, 200), reasons: verdict.reasons },
          update: { reasons: verdict.reasons },
        }),
      );
    return;
  }
  const held = verdict.verdict === "REVIEW";
  if (o.dryRun) {
    c.created.n++;
    budget.worksLeft--;
    return void o.log(`  ${id} ${verdict.verdict}${verdict.deferFetch ? "(defer)" : ""} ${info.type}/${info.language} ${info.files.length}p`);
  }

  const externalId = String(id);
  let ws = await db(() =>
    prisma.workSource.findUnique({ where: { site_externalId: { site: hm.SITE, externalId } }, include: { work: true } }),
  );
  if (!ws) {
    // every language version of a gallery lists its siblings; the lowest id is the group key
    const lang = hm.langCode(info.language);
    const probe = { titleNorm: normTitle(info.title), language: lang, kind: "ONESHOT" as const, pageCount: info.files.length, artists: n.artists };
    const dup = await findDuplicate(probe);
    if (dup) {
      await attachSource(dup.id, hm.SITE, externalId, `https://hitomi.la/galleries/${id}.html`);
      stats.duplicates++;
      return void o.log(`  ${id} DUPLICATE of #${dup.publicId}, source attached (nothing downloaded)`);
    }
    const siblings = (info.languages ?? []).map((l) => Number(l.galleryid)).filter(Number.isFinite);
    const created = await db(() =>
      prisma.work.create({
        data: {
          slug: slug(info.title) || "work",
          kind: "ONESHOT",
          category: hm.categoryFor(info.type) as never,
          title: info.title,
          titleNorm: probe.titleNorm,
          titleOriginal: info.japanese_title,
          altTitles: info.japanese_title ? [info.japanese_title] : [],
          language: lang,
          translationGroupId: `hitomi:${Math.min(id, ...siblings)}`,
          year: Number((info.datepublished ?? info.date ?? "").slice(0, 4)) || null,
          needsReview: held,
          deferFetch: verdict.deferFetch,
          safetyVerdict: held ? "REVIEW" : "CLEAN",
          safetyReasons: verdict.reasons,
          seedPopularity: seed,
          sources: { create: { site: hm.SITE, externalId, url: `https://hitomi.la/galleries/${id}.html` } },
        },
      }),
    );
    for (const sim of await findSimilar(probe, created.id)) await recordCandidate(created.id, sim.id, sim.score, ["similar title"]);
    stats.worksCreated++;
    c.created.n++;
    budget.worksLeft--;
    if (held) stats.worksHeld++;
    const tagIds = await upsertTags([
      ...n.tags.map((name) => ({ type: "TAG" as const, name })),
      ...n.artists.map((name) => ({ type: "ARTIST" as const, name })),
      ...n.groups.map((name) => ({ type: "GROUP" as const, name })),
      ...n.parodies.map((name) => ({ type: "PARODY" as const, name })),
      ...n.characters.map((name) => ({ type: "CHARACTER" as const, name })),
      ...(info.language ? [{ type: "LANGUAGE" as const, name: info.language }] : []),
      { type: "CATEGORY" as const, name: info.type },
    ]);
    await db(() =>
      prisma.work.update({ where: { id: created.id }, data: { tagIds, tags: { connect: tagIds.map((t) => ({ id: t })) } } }),
    );
    ws = await db(() =>
      prisma.workSource.findUniqueOrThrow({ where: { site_externalId: { site: hm.SITE, externalId } }, include: { work: true } }),
    );
  }
  const work = ws.work;

  // explicit age markers: hold with NO downloads until an admin approves
  if (work.deferFetch && work.reviewDecision !== "APPROVED") return void o.log(`  ${id} HELD (review before download) - nothing fetched`);
  if (work.publish === "REJECTED") return;

  await db(() =>
    prisma.chapter.createMany({ data: [{ workId: work.id, number: 1, sourceChapterId: externalId }], skipDuplicates: true }),
  );
  const chapter = await db(() =>
    prisma.chapter.findUniqueOrThrow({ where: { workId_number: { workId: work.id, number: 1 } }, select: { id: true, status: true, attempts: true } }),
  );

  const coverP = work.coverKey
    ? Promise.resolve()
    : hm
        .downloadPage(info.files[0])
        .then((buf) => storeCover(work.id, work.mediaId, buf))
        .then(() => undefined)
        .catch((e) => void stats.errors.push(`cover ${id}: ${(e as Error).message}`));

  if (chapter.status !== "READY" && chapter.attempts < MAX_ATTEMPTS) {
    try {
      await storeChapterPages(
        work,
        chapter.id,
        async () => info.files.map((f, i) => ({ n: i + 1, get: () => hm.downloadPage(f) })),
        info.files.length,
        parseDate(info),
        stats,
        budget,
        o.log,
        PAGE_CONCURRENCY,
      );
    } catch (e) {
      stats.errors.push(`gallery ${id}: ${(e as Error).message}`);
    }
  }
  await coverP;

  const done = await finalizeWork(work.id, ws.id);
  o.log(`  ${id} ${done.published ? "PUBLISHED" : done.held ? "HELD (review)" : "draft"} ${info.type}/${info.language} ${info.files.length}p`);
}

function parseDate(info: HGallery): Date | null {
  const d = new Date(info.datepublished ?? info.date ?? "");
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function runHitomi(o: HitomiOptions): Promise<IngestStats> {
  const stats = emptyStats();
  const budget = new Budget(o.maxMinutes, o.limit);
  const runId = await beginRun(hm.SITE, o.mode, o.dryRun);
  const langs = (o.langs.length ? o.langs : ["en"]).filter((l) => hm.LANGUAGES[l]);

  try {
    if (o.mode === "retry") {
      // galleries whose chapter failed or never finished
      const rows = await db(() =>
        prisma.workSource.findMany({
          where: {
            site: hm.SITE,
            work: { publish: { not: "REJECTED" }, chapters: { some: { status: { not: "READY" }, attempts: { lt: MAX_ATTEMPTS } } } },
          },
          orderBy: { lastFetchedAt: { sort: "asc", nulls: "first" } },
          take: o.limit,
          select: { externalId: true },
        }),
      );
      o.log(`retry: ${rows.length} gallery(ies) with unfinished chapters`);
      const c: Ctx = { o, stats, budget, created: { n: 0, cap: Infinity } };
      await pool(rows, GALLERY_CONCURRENCY, async (r) => {
        if (!budget.tripped) await processGallery(Number(r.externalId), 0, c);
      });
    } else {
      const perLang = Math.max(1, Math.ceil(o.limit / langs.length));
      for (const lang of langs) {
        if (budget.expired) break;
        const path = hm.indexPath(o.mode, lang);
        const key = `hitomi:${o.mode}:${lang}:offset`;
        const saved = o.mode === "popular" ? await db(() => prisma.setting.findUnique({ where: { key } })) : null;
        let offset = (saved?.value as { offset?: number } | null)?.offset ?? 0;
        const c: Ctx = { o, stats, budget, created: { n: 0, cap: perLang } };

        while (!budget.expired && c.created.n < c.created.cap) {
          const { ids, total } = await hm.listIds(path, offset, CHUNK);
          if (!ids.length) {
            o.log(`${lang}: reached the end of ${path}`);
            break;
          }
          const [known, suppressed] = await Promise.all([
            db(() => prisma.workSource.findMany({ where: { site: hm.SITE, externalId: { in: ids.map(String) } }, select: { externalId: true } })),
            db(() => prisma.suppressedSource.findMany({ where: { site: hm.SITE, externalId: { in: ids.map(String) } }, select: { externalId: true } })),
          ]);
          const skip = new Set([...known, ...suppressed].map((r) => r.externalId));
          const fresh = ids.map((id, i) => ({ id, rank: offset + i })).filter((x) => !skip.has(String(x.id)));
          o.log(`${lang} ${o.mode} offset ${offset} (${ids.length} of ${Math.round(total)}, ${fresh.length} new)`);

          if (o.mode === "recent" && fresh.length === 0) {
            o.log(`${lang}: caught up with the newest uploads`);
            break;
          }
          let consumed = ids.length;
          await pool(fresh, GALLERY_CONCURRENCY, async (x) => {
            if (budget.expired || c.created.n >= c.created.cap) return;
            await processGallery(x.id, Math.max(1, 50_000 - x.rank), c);
          });
          // if we stopped early, resume at the first unprocessed gallery next time
          if (budget.expired || c.created.n >= c.created.cap) {
            const lastDone = await db(() =>
              prisma.workSource.findMany({ where: { site: hm.SITE, externalId: { in: fresh.map((x) => String(x.id)) } }, select: { externalId: true } }),
            );
            const done = new Set(lastDone.map((r) => r.externalId));
            const firstOpen = fresh.find((x) => !done.has(String(x.id)));
            consumed = firstOpen ? firstOpen.rank - offset : ids.length;
          }
          offset += consumed;
          if (o.mode === "popular" && !o.dryRun)
            await db(() => prisma.setting.upsert({ where: { key }, create: { key, value: { offset } }, update: { value: { offset } } }));
        }
      }
    }
  } finally {
    await endRun(runId, stats);
  }
  return stats;
}
