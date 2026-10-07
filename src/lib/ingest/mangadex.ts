import { prisma, db } from "@/lib/db";
import { pool } from "@/lib/http";
import { toWebp } from "@/lib/images";
import { r2Put } from "@/lib/r2";
import { Budget, MAX_ATTEMPTS, beginRun, emptyStats, endRun, finalizeWork, storeChapterPages, type IngestStats } from "@/lib/ingest/shared";
import { classify } from "@/lib/safety/classify";
import { loadTerms } from "@/lib/safety/load-terms";
import { slug, normLang, langName, upsertTags } from "@/lib/tags";
import { attachSource, findDuplicate, findSimilar, normTitle, recordCandidate } from "@/lib/dedupe";
import * as md from "@/lib/sources/mangadex";
import type { MdChapter, MdManga } from "@/lib/sources/mangadex";

export interface IngestOptions {
  /** popular = most-followed first, then continues into backlog; backlog = the rest of the catalogue; update = revisit known works */
  mode: "popular" | "backlog" | "update";
  /** stop after this many works were processed (skipped ones do not count) */
  limit: number;
  maxMinutes: number;
  /** per work per language per run; the rest are picked up by the next run */
  maxChapters: number;
  /** only these languages (e.g. ["en","ja"]); empty = all */
  langs: string[];
  dryRun: boolean;
  log: (m: string) => void;
}

const PAGE_CONCURRENCY = Number(process.env.PAGE_CONCURRENCY) || 12;
const CHAPTER_CONCURRENCY = Number(process.env.CHAPTER_CONCURRENCY) || 3;
const LANG_PRIORITY = ["en", "ja", "es", "pt", "fr", "de", "it", "ru", "zh", "ko"];

/** one chapter per number: prefer the most pages, then the earliest published */
function dedupeChapters(chs: MdChapter[]): { number: number; ch: MdChapter }[] {
  const byNum = new Map<number, MdChapter>();
  const only = chs.length === 1;
  for (const ch of chs) {
    let n = Number(ch.attributes.chapter);
    if (!Number.isFinite(n)) {
      if (!only) continue;
      n = 1;
    }
    const cur = byNum.get(n);
    if (
      !cur ||
      ch.attributes.pages > cur.attributes.pages ||
      (ch.attributes.pages === cur.attributes.pages && ch.attributes.publishAt < cur.attributes.publishAt)
    )
      byNum.set(n, ch);
  }
  return [...byNum.entries()].sort((a, b) => a[0] - b[0]).map(([number, ch]) => ({ number, ch }));
}

async function storeCover(mediaId: string, m: MdManga): Promise<string | null> {
  const url = md.coverUrl(m);
  if (!url) return null;
  const img = await toWebp(await md.downloadPage(url), { maxWidth: 600 });
  const key = `c/${mediaId}.webp`;
  await r2Put(key, img.data);
  return key;
}

async function storeChapter(
  work: { id: string; mediaId: string },
  chapterId: string,
  src: MdChapter,
  stats: IngestStats,
  budget: Budget,
  log: (m: string) => void,
): Promise<void> {
  await storeChapterPages(
    work,
    chapterId,
    async () => (await md.pageRefs(src.id)).map((r) => ({ n: r.n, get: () => md.downloadPage(r.url) })),
    src.attributes.pages,
    new Date(src.attributes.publishAt),
    stats,
    budget,
    log,
    PAGE_CONCURRENCY,
  );
}

/** Ingest one MangaDex manga: one Work per language it has readable chapters in. */
async function processManga(
  m: MdManga,
  seed: number,
  o: IngestOptions,
  stats: IngestStats,
  budget: Budget,
): Promise<boolean> {
  stats.worksSeen++;
  const a = m.attributes;

  const allTitles = [...Object.values(a.title), ...a.altTitles.flatMap((t) => Object.values(t))];
  const tags = md.tagNames(m);
  const verdict = classify(
    { title: md.titleFor(m, "en"), altTitles: allTitles, description: md.descriptionFor(m, "en"), tags },
    await loadTerms(),
  );

  if (verdict.verdict === "QUARANTINE") {
    stats.worksSuppressed++;
    if (!o.dryRun)
      await db(() =>
        prisma.suppressedSource.upsert({
          where: { site_externalId: { site: md.SITE, externalId: m.id } },
          create: { site: md.SITE, externalId: m.id, title: md.titleFor(m, "en").slice(0, 200), reasons: verdict.reasons },
          update: { reasons: verdict.reasons },
        }),
      );
    return false;
  }
  const held = verdict.verdict === "REVIEW";

  const chapters = await md.listChapters(m.id);
  const byLang = new Map<string, MdChapter[]>();
  for (const c of chapters) {
    const l = normLang(c.attributes.translatedLanguage);
    byLang.set(l, [...(byLang.get(l) ?? []), c]);
  }
  if (!byLang.size) {
    return false;
  }
  if (o.dryRun) {
    o.log(`  dry-run: ${verdict.verdict}${verdict.deferFetch ? "(defer)" : ""} langs=${[...byLang].map(([l, c]) => `${l}:${c.length}`).join(",")}`);
    return true;
  }

  const isDoujin = tags.some((t) => /^doujinshi$/i.test(t));
  const authors = md.names(m, "author");
  const artists = md.names(m, "artist");

  // English first, then the big languages, then the rest by chapter count - so a short
  // run always covers the most-read variants before the budget runs out
  const order = [...byLang]
    .filter(([l]) => !o.langs.length || o.langs.includes(l))
    .sort(([a, x], [b, y]) => {
      const pa = LANG_PRIORITY.indexOf(a);
      const pb = LANG_PRIORITY.indexOf(b);
      return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || y.length - x.length;
    });

  for (const [lang, chs] of order) {
    if (budget.expired) break;
    const picked = dedupeChapters(chs);
    if (!picked.length) continue;
    const externalId = `${m.id}:${lang}`;

    // find or create the Work for this (manga, language)
    let ws = await db(() =>
      prisma.workSource.findUnique({ where: { site_externalId: { site: md.SITE, externalId } }, include: { work: true } }),
    );
    if (!ws) {
      const title = md.titleFor(m, lang);
      const probe = {
        titleNorm: normTitle(title),
        language: lang,
        kind: (picked.length === 1 ? "ONESHOT" : "SERIES") as "ONESHOT" | "SERIES",
        pageCount: picked.length === 1 ? picked[0].ch.attributes.pages : 0,
        artists: [...authors, ...artists],
      };
      const dup = await findDuplicate(probe);
      if (dup) {
        await attachSource(dup.id, md.SITE, externalId, `https://mangadex.org/title/${m.id}`);
        stats.duplicates++;
        o.log(`  duplicate of #${dup.publicId}, source attached (nothing downloaded)`);
        continue;
      }
      const created = await db(() =>
        prisma.work.create({
          data: {
            slug: slug(title) || "work",
            kind: picked.length === 1 ? "ONESHOT" : "SERIES",
            category: isDoujin ? "DOUJINSHI" : "MANGA",
            title,
            titleNorm: probe.titleNorm,
            titleOriginal: a.altTitles.find((t) => t[a.originalLanguage])?.[a.originalLanguage] ?? null,
            altTitles: [...new Set(allTitles)].filter((t) => t !== title).slice(0, 20),
            description: md.descriptionFor(m, lang),
            language: lang,
            translationGroupId: m.id,
            year: a.year,
            needsReview: held,
            deferFetch: verdict.deferFetch,
            safetyVerdict: held ? "REVIEW" : "CLEAN",
            safetyReasons: verdict.reasons,
            seedPopularity: seed,
            sources: { create: { site: md.SITE, externalId, url: `https://mangadex.org/title/${m.id}` } },
          },
        }),
      );
      for (const sim of await findSimilar(probe, created.id)) await recordCandidate(created.id, sim.id, sim.score, ["similar title"]);
      stats.worksCreated++;
      if (held) stats.worksHeld++;
      const tagIds = await upsertTags([
        ...tags.map((name) => ({ type: "TAG" as const, name })),
        ...[...authors, ...artists].map((name) => ({ type: "ARTIST" as const, name })),
        { type: "LANGUAGE" as const, name: langName(lang) },
        { type: "CATEGORY" as const, name: isDoujin ? "doujinshi" : "manga" },
      ]);
      await db(() =>
        prisma.work.update({ where: { id: created.id }, data: { tagIds, tags: { connect: tagIds.map((id) => ({ id })) } } }),
      );
      ws = await db(() =>
        prisma.workSource.findUniqueOrThrow({ where: { site_externalId: { site: md.SITE, externalId } }, include: { work: true } }),
      );
    }
    const work = ws.work;

    // explicit age markers: hold with NO downloads until an admin approves
    if (work.deferFetch && work.reviewDecision !== "APPROVED") {
      o.log("  held (review before download), nothing fetched");
      continue;
    }
    if (work.publish === "REJECTED") continue;

    // cover and chapter rows (one batched insert), then fetch the missing chapters in parallel
    const coverP = work.coverKey
      ? Promise.resolve()
      : storeCover(work.mediaId, m)
          .then((coverKey) => (coverKey ? db(() => prisma.work.update({ where: { id: work.id }, data: { coverKey } })) : null))
          .catch((e) => void stats.errors.push(`cover ${m.id}: ${(e as Error).message}`));

    await db(() =>
      prisma.chapter.createMany({
        data: picked.map(({ number, ch }) => ({
          workId: work.id, number, volume: ch.attributes.volume, title: ch.attributes.title, sourceChapterId: ch.id,
        })),
        skipDuplicates: true,
      }),
    );
    const todo = await db(() =>
      prisma.chapter.findMany({
        where: { workId: work.id, status: { not: "READY" }, attempts: { lt: MAX_ATTEMPTS } },
        orderBy: { number: "asc" },
        take: o.maxChapters,
        select: { id: true, number: true },
      }),
    );
    const srcByNumber = new Map(picked.map((p) => [p.number, p.ch]));
    await pool(todo, CHAPTER_CONCURRENCY, async (row) => {
      if (budget.expired) return;
      try {
        await storeChapter(work, row.id, srcByNumber.get(row.number)!, stats, budget, o.log);
      } catch (e) {
        stats.errors.push(`chapter ${srcByNumber.get(row.number)!.id}: ${(e as Error).message}`);
      }
    });
    await coverP;

    const done = await finalizeWork(work.id, ws.id);
    o.log(
      `  #${work.publicId} [${lang}] ${done.published ? "PUBLISHED" : done.held ? "HELD (review)" : "draft"} chapters ${done.ready}/${picked.length}`,
    );
  }
  return true;
}

export type { IngestStats };

export async function runMangadex(o: IngestOptions): Promise<IngestStats> {
  const stats = emptyStats();
  const budget = new Budget(o.maxMinutes, o.limit);
  const runId = await beginRun(md.SITE, o.mode, o.dryRun);

  const handle = async (m: MdManga, seed: number) => {
    try {
      if (await processManga(m, seed, o, stats, budget)) budget.worksLeft--;
    } catch (e) {
      stats.errors.push(`manga: ${(e as Error).message}`);
      o.log(`  error: ${(e as Error).message}`);
    }
  };

  /** Handle one page of listing results; returns how many items were reached before the budget ran out. */
  const sweep = async (data: MdManga[], note: string): Promise<number> => {
    const ids = data.map((x) => x.id);
    const [follows, known, suppressed] = await Promise.all([
      md.follows(ids),
      db(() =>
        prisma.workSource.findMany({
          where: { site: md.SITE, OR: ids.map((id) => ({ externalId: { startsWith: `${id}:` } })) },
          select: { externalId: true },
        }),
      ),
      db(() => prisma.suppressedSource.findMany({ where: { site: md.SITE, externalId: { in: ids } }, select: { externalId: true } })),
    ]);
    const skip = new Set([...known.map((k) => k.externalId.split(":")[0]), ...suppressed.map((s) => s.externalId)]);
    o.log(`${note} (${data.length} listed, ${skip.size} already known)`);
    let i = 0;
    for (; i < data.length && !budget.expired; i++) {
      if (skip.has(data[i].id)) continue;
      await handle(data[i], follows[data[i].id] ?? 0);
    }
    return i;
  };

  let phase: "popular" | "backlog" | "update" = o.mode;

  if (phase === "popular") {
    // most-followed first. MangaDex caps offsets at 10,000, so this covers the top of the catalogue.
    const key = "mangadex:popular:offset";
    const saved = await db(() => prisma.setting.findUnique({ where: { key } }));
    let offset = (saved?.value as { offset?: number } | null)?.offset ?? 0;
    while (!budget.expired && offset <= 9900) {
      const page = await md.listPopular(offset);
      if (!page.data.length) {
        offset = 10_000;
        break;
      }
      const reached = await sweep(page.data, `popular offset ${offset} of ${page.total}`);
      offset += reached; // resume exactly where we stopped
      if (!o.dryRun)
        await db(() => prisma.setting.upsert({ where: { key }, create: { key, value: { offset } }, update: { value: { offset } } }));
      if (reached < page.data.length) break;
    }
    if (offset > 9900 && !budget.expired) {
      o.log("popular pass complete, continuing with the rest of the catalogue");
      phase = "backlog";
    }
  }

  if (phase === "backlog") {
    // everything else, oldest first, with no offset limit (keyset on createdAt)
    const key = "mangadex:backlog:cursor";
    const saved = await db(() => prisma.setting.findUnique({ where: { key } }));
    let cur = (saved?.value as { since?: string; offset?: number } | null) ?? {};
    let since = cur.since ?? "2000-01-01T00:00:00";
    let offset = cur.offset ?? 0;
    while (!budget.expired) {
      const page = await md.listByCreated(since, offset);
      if (!page.data.length) {
        o.log("backlog complete: the whole catalogue has been listed");
        break;
      }
      const reached = await sweep(page.data, `backlog from ${since.slice(0, 10)} +${offset}`);
      const last = page.data[page.data.length - 1];
      const firstAt = md.toSince(page.data[0].attributes.createdAt);
      if (reached < page.data.length) {
        // stopped mid-page: restart at the first unprocessed item
        since = md.toSince(page.data[reached].attributes.createdAt);
        offset = 0;
      } else if (md.toSince(last.attributes.createdAt) === firstAt && firstAt === since) {
        offset += page.data.length; // a whole page shares one timestamp: step through it by offset
      } else {
        since = md.toSince(last.attributes.createdAt);
        offset = 0;
      }
      if (!o.dryRun)
        await db(() => prisma.setting.upsert({ where: { key }, create: { key, value: { since, offset } }, update: { value: { since, offset } } }));
      if (page.data.length < 100 && reached >= page.data.length) {
        o.log("backlog complete: reached the newest work");
        break;
      }
    }
  }

  if (phase === "update") {
    // revisit works we already have - new chapters, retries of failed ones, other languages
    const sources = await db(() =>
      prisma.workSource.findMany({
        where: { site: md.SITE, status: "ACTIVE" },
        orderBy: { lastFetchedAt: { sort: "asc", nulls: "first" } },
        take: o.limit * 3,
        select: { externalId: true },
      }),
    );
    const ids = [...new Set(sources.map((s) => s.externalId.split(":")[0]))];
    for (const id of ids) {
      if (budget.expired) break;
      const m = await md.getManga(id);
      if (m) await handle(m, 0);
    }
  }

  await endRun(runId, stats);
  return stats;
}
