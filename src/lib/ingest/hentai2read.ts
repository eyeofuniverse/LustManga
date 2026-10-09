import { statsToFields } from "@/lib/signals";
import { prisma, db } from "@/lib/db";
import { pool } from "@/lib/http";
import { classify } from "@/lib/safety/classify";
import { loadTerms } from "@/lib/safety/load-terms";
import { slug as slugify, upsertTags } from "@/lib/tags";
import { attachSource, findDuplicate, findSimilar, normTitle, recordCandidate } from "@/lib/dedupe";
import * as h2r from "@/lib/sources/hentai2read";
import { langCode } from "@/lib/sources/hitomi";
import {
  Budget,
  MAX_ATTEMPTS,
  beginRun,
  anon,
  emptyStats,
  endRun,
  finalizeWork,
  pageNewer,
  saveCursor,
  scaleSeed,
  storeChapterPages,
  storeCover,
  type IngestStats,
} from "@/lib/ingest/shared";

export interface H2ROptions {
  /** popular = most-read (resumable page cursor), recent = newest uploads, retry = finish failed works */
  mode: "popular" | "recent" | "retry";
  /** stop after this many NEW works */
  limit: number;
  maxMinutes: number;
  /** skip works bigger than this many pages */
  maxPages: number;
  /** per work per run, for multi-chapter works */
  maxChapters: number;
  dryRun: boolean;
  log: (m: string) => void;
}

// the site is slow and flaky: keep concurrency low
const PAGE_CONCURRENCY = Number(process.env.H2R_PAGE_CONCURRENCY) || 6;
const WORK_CONCURRENCY = Number(process.env.H2R_WORK_CONCURRENCY) || 2;

type Ctx = { o: H2ROptions; stats: IngestStats; budget: Budget; created: { n: number } };

async function processWork(slug: string, seedFallback: number, c: Ctx): Promise<void> {
  const { o, stats, budget } = c;
  const w = await h2r.getWork(slug).catch((e) => {
    stats.errors.push(`work ${anon(slug)}: ${(e as Error).message}`);
    return null;
  });
  if (!w) return;
  stats.worksSeen++;
  const totalPages = w.pages;
  if (o.maxPages > 0 && totalPages > o.maxPages) return; // 0 = no limit

  const tags = [...w.genres, ...w.content];
  const verdict = classify({ title: w.title, altTitles: [], description: null, tags }, await loadTerms());

  if (verdict.verdict === "QUARANTINE") {
    stats.worksSuppressed++;
    if (!o.dryRun)
      await db(() =>
        prisma.suppressedSource.upsert({
          where: { site_externalId: { site: h2r.SITE, externalId: slug } },
          create: { site: h2r.SITE, externalId: slug, title: w.title.slice(0, 200), reasons: verdict.reasons },
          update: { reasons: verdict.reasons },
        }),
      );
    return;
  }
  const held = verdict.verdict === "REVIEW";
  const kind = w.chapters.length > 1 ? ("SERIES" as const) : ("ONESHOT" as const);
  const lang = langCode(w.language.toLowerCase());
  if (o.dryRun) {
    c.created.n++;
    budget.worksLeft--;
    return void o.log(`  dry-run: ${verdict.verdict}${verdict.deferFetch ? "(defer)" : ""} ${kind.toLowerCase()} ${totalPages}p ${w.chapters.length}ch`);
  }

  let ws = await db(() =>
    prisma.workSource.findUnique({ where: { site_externalId: { site: h2r.SITE, externalId: slug } }, include: { work: true } }),
  );
  if (!ws) {
    const probe = { titleNorm: normTitle(w.title), language: lang, kind, pageCount: kind === "ONESHOT" ? totalPages : 0, artists: w.artists };
    const dup = await findDuplicate(probe);
    if (dup) {
      await attachSource(dup.id, h2r.SITE, slug, `https://hentai2read.com/${slug}/`);
      stats.duplicates++;
      return void o.log(`  duplicate of #${dup.publicId}, source attached (nothing downloaded)`);
    }
    const stat = statsToFields(h2r.SITE, { ...w.stats, views: w.stats.views ?? (w.views || undefined) });
    const created = await db(() =>
      prisma.work.create({
        data: {
          slug: slugify(w.title) || "work",
          kind,
          category: w.parodies.length || w.genres.some((g) => /doujin/i.test(g)) ? "DOUJINSHI" : "MANGA",
          title: w.title,
          titleNorm: probe.titleNorm,
          language: lang,
          translationGroupId: `hentai2read:${slug}`,
          year: w.year,
          needsReview: held,
          deferFetch: verdict.deferFetch,
          safetyVerdict: held ? "REVIEW" : "CLEAN",
          safetyReasons: verdict.reasons,
          ...stat,
          seedPopularity: Math.max(w.views ? scaleSeed(w.views, 60_000_000) : seedFallback, stat.seedPopularity ?? 0),
          statsAt: new Date(),
          sources: { create: { site: h2r.SITE, externalId: slug, url: `https://hentai2read.com/${slug}/` } },
        },
      }),
    );
    for (const sim of await findSimilar(probe, created.id)) await recordCandidate(created.id, sim.id, sim.score, ["similar title"]);
    stats.worksCreated++;
    c.created.n++;
    budget.worksLeft--;
    if (held) stats.worksHeld++;
    const tagIds = await upsertTags([
      ...tags.map((name) => ({ type: "TAG" as const, name })),
      ...w.artists.map((name) => ({ type: "ARTIST" as const, name })),
      ...w.parodies.map((name) => ({ type: "PARODY" as const, name })),
      ...w.characters.map((name) => ({ type: "CHARACTER" as const, name })),
      { type: "LANGUAGE" as const, name: w.language },
      { type: "CATEGORY" as const, name: kind === "SERIES" ? "manga" : "doujinshi" },
    ]);
    await db(() => prisma.work.update({ where: { id: created.id }, data: { tagIds, tags: { connect: tagIds.map((t) => ({ id: t })) } } }));
    ws = await db(() =>
      prisma.workSource.findUniqueOrThrow({ where: { site_externalId: { site: h2r.SITE, externalId: slug } }, include: { work: true } }),
    );
  }
  const work = ws.work;

  // explicit age markers: hold with NO downloads until an admin approves
  if (work.deferFetch && work.reviewDecision !== "APPROVED") return void o.log("  held (review before download), nothing fetched");
  if (work.publish === "REJECTED") return;

  const chapters = w.chapters.length ? w.chapters : [{ slug: "1", number: 1 }];
  await db(() =>
    prisma.chapter.createMany({
      data: chapters.map((ch) => ({ workId: work.id, number: ch.number, sourceChapterId: `${slug}/${ch.slug}` })),
      skipDuplicates: true,
    }),
  );
  const todo = await db(() =>
    prisma.chapter.findMany({
      where: { workId: work.id, status: { not: "READY" }, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { number: "asc" },
      take: o.maxChapters,
      select: { id: true, number: true, sourceChapterId: true },
    }),
  );

  let needCover = !work.coverKey;
  for (const ch of todo) {
    if (budget.expired) break;
    const chapterSlug = (ch.sourceChapterId ?? `${slug}/1`).split("/")[1];
    try {
      let firstImage: string | null = null;
      await storeChapterPages(
        work,
        ch.id,
        async () => {
          const urls = await h2r.getChapterImages(slug, chapterSlug);
          firstImage = urls[0] ?? null;
          return urls.map((u, i) => ({ n: i + 1, get: () => h2r.downloadImage(u) }));
        },
        kind === "ONESHOT" ? totalPages : 1,
        null,
        stats,
        budget,
        o.log,
        PAGE_CONCURRENCY,
      );
      if (needCover && firstImage) {
        await storeCover(work.id, work.mediaId, await h2r.downloadImage(firstImage));
        needCover = false;
      }
    } catch (e) {
      stats.errors.push(`work ${anon(slug)} ch ${chapterSlug}: ${(e as Error).message}`);
    }
  }

  const done = await finalizeWork(work.id, ws.id);
  o.log(`  #${work.publicId} ${done.published ? "PUBLISHED" : done.held ? "HELD (review)" : "draft"} ${kind.toLowerCase()} ${totalPages}p ${done.ready}/${chapters.length}ch`);
}

export async function runHentai2Read(o: H2ROptions): Promise<IngestStats> {
  const stats = emptyStats();
  const budget = new Budget(o.maxMinutes, o.limit);
  const runId = await beginRun(h2r.SITE, o.mode, o.dryRun);
  const c: Ctx = { o, stats, budget, created: { n: 0 } };

  try {
    if (o.mode === "retry") {
      const rows = await db(() =>
        prisma.workSource.findMany({
          where: {
            site: h2r.SITE,
            work: { publish: { not: "REJECTED" }, chapters: { some: { status: { not: "READY" }, attempts: { lt: MAX_ATTEMPTS } } } },
          },
          orderBy: { lastFetchedAt: { sort: "asc", nulls: "first" } },
          take: o.limit,
          select: { externalId: true },
        }),
      );
      o.log(`retry: ${rows.length} work(s) with unfinished chapters`);
      await pool(rows, WORK_CONCURRENCY, async (r) => {
        if (!budget.tripped) await processWork(r.externalId, 0, c);
      });
    } else {
      const key = `hentai2read:${o.mode}:page`;
      const saved = o.mode === "popular" ? await db(() => prisma.setting.findUnique({ where: { key } })) : null;
      let page = (saved?.value as { page?: number } | null)?.page ?? 1;
      let idle = 0; // consecutive pages that produced nothing new

      while (!budget.expired) {
        const slugs = await h2r.listSlugs(o.mode, page);
        if (!slugs.length) {
          o.log(`reached the end of the ${o.mode} list at page ${page}`);
          break;
        }
        const [known, suppressed] = await Promise.all([
          db(() => prisma.workSource.findMany({ where: { site: h2r.SITE, externalId: { in: slugs } }, select: { externalId: true } })),
          db(() => prisma.suppressedSource.findMany({ where: { site: h2r.SITE, externalId: { in: slugs } }, select: { externalId: true } })),
        ]);
        const skip = new Set([...known, ...suppressed].map((r) => r.externalId));
        const fresh = slugs.filter((s) => !skip.has(s));
        o.log(`${o.mode} page ${page} (${slugs.length} works, ${fresh.length} new)`);

        if (o.mode === "recent" && fresh.length === 0) {
          o.log("caught up with the newest uploads");
          break;
        }
        const before = c.created.n;
        await pool(fresh, WORK_CONCURRENCY, async (s) => {
          if (!budget.expired) await processWork(s, Math.max(1, 5000 - (page - 1) * slugs.length), c);
        });
        // stopped mid-page: resume this page next run (known works are skipped)
        if (budget.expired) break;
        if (o.mode === "recent") {
          idle = c.created.n === before ? idle + 1 : 0;
          if (idle >= 3) {
            o.log("nothing new for 3 pages, stopping");
            break;
          }
        }
        page++;
        if (o.mode === "popular" && !o.dryRun) await saveCursor(key, { page }, pageNewer);
      }
    }
  } finally {
    await endRun(runId, stats);
  }
  return stats;
}
