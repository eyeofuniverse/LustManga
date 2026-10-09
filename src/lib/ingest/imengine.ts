import { prisma, db } from "@/lib/db";
import { pool } from "@/lib/http";
import { classify } from "@/lib/safety/classify";
import { loadTerms } from "@/lib/safety/load-terms";
import { slug as slugify, upsertTags } from "@/lib/tags";
import { attachSource, findDuplicate, findSimilar, normTitle, recordCandidate } from "@/lib/dedupe";
import * as im from "@/lib/sources/imengine";
import { LANGUAGES, langCode } from "@/lib/sources/hitomi";
import { statsToFields } from "@/lib/signals";
import {
  Budget,
  MAX_ATTEMPTS,
  anon,
  beginRun,
  emptyStats,
  endRun,
  finalizeWork,
  pageNewer,
  saveCursor,
  storeChapterPages,
  storeCover,
  type IngestStats,
} from "@/lib/ingest/shared";

export interface ImOptions {
  /** popular = best first where the site has such a list (otherwise newest first), recent = newest first, retry = finish failed works */
  mode: "popular" | "recent" | "retry";
  limit: number;
  maxMinutes: number;
  /** our language codes (en, ja, ...); empty = English; "all" = the site's unfiltered list */
  langs: string[];
  /** skip galleries bigger than this many pages; 0 = no limit */
  maxPages: number;
  dryRun: boolean;
  log: (m: string) => void;
}

const PAGE_CONCURRENCY = Number(process.env.IM_PAGE_CONCURRENCY) || 8;
const WORK_CONCURRENCY = Number(process.env.IM_WORK_CONCURRENCY) || 3;

type Ctx = { cfg: im.SiteCfg; o: ImOptions; stats: IngestStats; budget: Budget; created: { n: number; cap: number } };

const LANGUAGE_NAMES = new Set(Object.values(LANGUAGES));

async function processGallery(id: string, seed: number, listLang: string | null, c: Ctx): Promise<void> {
  const { cfg, o, stats, budget } = c;
  const g = await im.getGallery(cfg, id).catch((e) => {
    stats.errors.push(`${cfg.name} gallery ${anon(id)}: ${(e as Error).message}`);
    return null;
  });
  if (!g) return;
  stats.worksSeen++;
  if (o.maxPages > 0 && g.pages > o.maxPages) return; // 0 = no limit

  const verdict = classify({ title: g.title, altTitles: [], description: null, tags: g.tags }, await loadTerms());
  if (verdict.verdict === "QUARANTINE") {
    stats.worksSuppressed++;
    if (!o.dryRun)
      await db(() =>
        prisma.suppressedSource.upsert({
          where: { site_externalId: { site: cfg.name, externalId: id } },
          create: { site: cfg.name, externalId: id, title: g.title.slice(0, 200), reasons: verdict.reasons },
          update: { reasons: verdict.reasons },
        }),
      );
    return;
  }
  const held = verdict.verdict === "REVIEW";
  // the language tag names the real language; "translated" / "rewrite" are not languages
  const langName = g.languages.map((l) => l.toLowerCase()).find((l) => LANGUAGE_NAMES.has(l));
  const lang = langName ? langCode(langName) : listLang ? langCode(listLang) : "und";

  if (o.dryRun) {
    c.created.n++;
    budget.worksLeft--;
    return void o.log(`  dry-run: ${verdict.verdict}${verdict.deferFetch ? "(defer)" : ""} ${g.categories[0] ?? "?"}/${lang} ${g.pages}p`);
  }

  let ws = await db(() =>
    prisma.workSource.findUnique({ where: { site_externalId: { site: cfg.name, externalId: id } }, include: { work: true } }),
  );
  if (!ws) {
    const probe = { titleNorm: normTitle(g.title), language: lang, kind: "ONESHOT" as const, pageCount: g.pages, artists: g.artists };
    const url = `${cfg.base}${cfg.galleryPath}${id}/`;
    const dup = await findDuplicate(probe);
    if (dup) {
      await attachSource(dup.id, cfg.name, id, url);
      stats.duplicates++;
      return void o.log(`  duplicate of #${dup.publicId}, source attached (nothing downloaded)`);
    }
    const stat = statsToFields(cfg.name, g.stats);
    const created = await db(() =>
      prisma.work.create({
        data: {
          slug: slugify(g.title) || "work",
          kind: "ONESHOT",
          category: im.categoryFor(g.categories) as never,
          title: g.title,
          titleNorm: probe.titleNorm,
          language: lang,
          translationGroupId: `${cfg.name}:${id}`,
          needsReview: held,
          deferFetch: verdict.deferFetch,
          safetyVerdict: held ? "REVIEW" : "CLEAN",
          safetyReasons: verdict.reasons,
          // the page's own counters (saves, likes, upload time) from day one; a rank-based seed from the list still counts
          ...stat,
          seedPopularity: Math.max(seed, stat.seedPopularity ?? 0),
          statsAt: new Date(),
          sources: { create: { site: cfg.name, externalId: id, url } },
        },
      }),
    );
    for (const sim of await findSimilar(probe, created.id)) await recordCandidate(created.id, sim.id, sim.score, ["similar title"]);
    stats.worksCreated++;
    c.created.n++;
    budget.worksLeft--;
    if (held) stats.worksHeld++;
    const tagIds = await upsertTags([
      ...g.tags.map((name) => ({ type: "TAG" as const, name })),
      ...g.artists.map((name) => ({ type: "ARTIST" as const, name })),
      ...g.groups.map((name) => ({ type: "GROUP" as const, name })),
      ...g.parodies.map((name) => ({ type: "PARODY" as const, name })),
      ...g.characters.map((name) => ({ type: "CHARACTER" as const, name })),
      ...(langName ? [{ type: "LANGUAGE" as const, name: langName }] : []),
      ...g.categories.map((name) => ({ type: "CATEGORY" as const, name })),
    ]);
    await db(() => prisma.work.update({ where: { id: created.id }, data: { tagIds, tags: { connect: tagIds.map((t) => ({ id: t })) } } }));
    ws = await db(() =>
      prisma.workSource.findUniqueOrThrow({ where: { site_externalId: { site: cfg.name, externalId: id } }, include: { work: true } }),
    );
  }
  const work = ws.work;

  // explicit age markers: hold with NO downloads until an admin approves
  if (work.deferFetch && work.reviewDecision !== "APPROVED") return void o.log("  held (review before download), nothing fetched");
  if (work.publish === "REJECTED") return;

  await db(() => prisma.chapter.createMany({ data: [{ workId: work.id, number: 1, sourceChapterId: id }], skipDuplicates: true }));
  const chapter = await db(() =>
    prisma.chapter.findUniqueOrThrow({ where: { workId_number: { workId: work.id, number: 1 } }, select: { id: true, status: true, attempts: true } }),
  );
  if (chapter.status !== "READY" && chapter.attempts < MAX_ATTEMPTS) {
    try {
      await storeChapterPages(
        work,
        chapter.id,
        async () => g.images.map((u, i) => ({ n: i + 1, get: () => im.downloadImage(cfg, u) })),
        g.pages,
        null,
        stats,
        budget,
        o.log,
        PAGE_CONCURRENCY,
      );
      if (!work.coverKey) await storeCover(work.id, work.mediaId, await im.downloadImage(cfg, g.images[0]));
    } catch (e) {
      stats.errors.push(`${cfg.name} gallery ${anon(id)}: ${(e as Error).message}`);
    }
  }
  const done = await finalizeWork(work.id, ws.id);
  o.log(`  #${work.publicId} ${done.published ? "PUBLISHED" : done.held ? "HELD (review)" : "draft"} ${g.categories[0] ?? "?"}/${lang} ${g.pages}p`);
}

export async function runImEngine(cfgName: string, o: ImOptions): Promise<IngestStats> {
  const cfg = im.SITES[cfgName];
  if (!cfg) throw new Error(`unknown site ${cfgName} (${Object.keys(im.SITES).join(", ")})`);
  const stats = emptyStats();
  const budget = new Budget(o.maxMinutes, o.limit);
  const runId = await beginRun(cfg.name, o.mode, o.dryRun);

  try {
    if (o.mode === "retry") {
      const rows = await db(() =>
        prisma.workSource.findMany({
          where: {
            site: cfg.name,
            work: { publish: { not: "REJECTED" }, chapters: { some: { status: { not: "READY" }, attempts: { lt: MAX_ATTEMPTS } } } },
          },
          orderBy: { lastFetchedAt: { sort: "asc", nulls: "first" } },
          take: o.limit,
          select: { externalId: true },
        }),
      );
      o.log(`retry: ${rows.length} work(s) with unfinished chapters`);
      const c: Ctx = { cfg, o, stats, budget, created: { n: 0, cap: Infinity } };
      await pool(rows, WORK_CONCURRENCY, async (r) => {
        if (!budget.tripped) await processGallery(r.externalId, 0, null, c);
      });
    } else {
      const wanted = o.langs.includes("all") ? [null] : (o.langs.length ? o.langs : ["en"]).map((l) => LANGUAGES[l]).filter(Boolean);
      const perLang = Math.max(1, Math.ceil(o.limit / wanted.length));
      for (const lang of wanted) {
        if (budget.expired) break;
        // sites without a popularity list are walked newest-first instead
        const mode = o.mode === "popular" && cfg.listUrl("popular", lang, 1) ? "popular" : "recent";
        const key = `${cfg.name}:${mode}:${lang ?? "all"}:page`;
        const saved = mode === "popular" || o.mode === "popular" ? await db(() => prisma.setting.findUnique({ where: { key } })) : null;
        let page = (saved?.value as { page?: number } | null)?.page ?? 1;
        let idle = 0; // consecutive pages that produced nothing new
        const c: Ctx = { cfg, o, stats, budget, created: { n: 0, cap: perLang } };

        while (!budget.expired && c.created.n < c.created.cap) {
          const ids = await im.listIds(cfg, mode, lang, page);
          if (!ids || !ids.length) {
            o.log(`${lang ?? "all"}: reached the end of the ${mode} list at page ${page}`);
            break;
          }
          const [known, suppressed] = await Promise.all([
            db(() => prisma.workSource.findMany({ where: { site: cfg.name, externalId: { in: ids } }, select: { externalId: true } })),
            db(() => prisma.suppressedSource.findMany({ where: { site: cfg.name, externalId: { in: ids } }, select: { externalId: true } })),
          ]);
          const skip = new Set([...known, ...suppressed].map((r) => r.externalId));
          const fresh = ids.filter((x) => !skip.has(x));
          o.log(`${cfg.name} ${lang ?? "all"} ${mode} page ${page} (${ids.length} listed, ${fresh.length} new)`);
          if (o.mode === "recent" && fresh.length === 0) {
            o.log("caught up with the newest uploads");
            break;
          }
          const before = c.created.n;
          await pool(fresh, WORK_CONCURRENCY, async (x) => {
            if (budget.expired || c.created.n >= c.created.cap) return;
            await processGallery(x, mode === "popular" ? Math.max(1, 50_000 - (page - 1) * ids.length) : 0, lang, c);
          });
          if (budget.expired || c.created.n >= c.created.cap) break; // stopped mid-page: resume this page next run
          if (o.mode === "recent") {
            idle = c.created.n === before ? idle + 1 : 0;
            if (idle >= 3) {
              o.log("nothing new for 3 pages, stopping");
              break;
            }
          }
          page++;
          if (!o.dryRun && (mode === "popular" || o.mode === "popular")) await saveCursor(key, { page }, pageNewer);
        }
      }
    }
  } finally {
    await endRun(runId, stats);
  }
  return stats;
}
