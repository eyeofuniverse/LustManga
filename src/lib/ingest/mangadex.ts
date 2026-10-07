import { prisma, db } from "@/lib/db";
import { pool } from "@/lib/http";
import { toWebp } from "@/lib/images";
import { r2Put } from "@/lib/r2";
import { classify } from "@/lib/safety/classify";
import { slug, normLang, langName, upsertTags } from "@/lib/tags";
import * as md from "@/lib/sources/mangadex";
import type { MdChapter, MdManga } from "@/lib/sources/mangadex";

export interface IngestOptions {
  mode: "popular" | "update";
  /** stop after this many works were processed (skipped ones do not count) */
  limit: number;
  maxMinutes: number;
  /** per work per run; the rest are picked up by the next run */
  maxChapters: number;
  /** only these languages (e.g. ["en","ja"]); empty = all */
  langs: string[];
  dryRun: boolean;
  log: (m: string) => void;
}

export interface IngestStats {
  worksSeen: number;
  worksCreated: number;
  worksHeld: number;
  worksSuppressed: number;
  chaptersFetched: number;
  pagesStored: number;
  errors: string[];
}

const PAGE_CONCURRENCY = Number(process.env.PAGE_CONCURRENCY) || 12;
const LANG_PRIORITY = ["en", "ja", "es", "pt", "fr", "de", "it", "ru", "zh", "ko"];

class Budget {
  private deadline: number;
  constructor(
    minutes: number,
    public worksLeft: number,
  ) {
    this.deadline = Date.now() + minutes * 60_000;
  }
  get expired() {
    return Date.now() > this.deadline || this.worksLeft <= 0;
  }
}

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
): Promise<void> {
  await db(() => prisma.chapter.update({ where: { id: chapterId }, data: { status: "FETCHING", error: null } }));
  try {
    const refs = await md.pageRefs(src.id);
    const pages = await pool(refs, PAGE_CONCURRENCY, async (ref) => {
      let lastErr: unknown;
      for (let i = 0; i < 3; i++) {
        try {
          const img = await toWebp(await md.downloadPage(ref.url));
          const key = `w/${work.mediaId}/${chapterId}/${ref.n}.webp`;
          await r2Put(key, img.data);
          return { order: ref.n, key, width: img.width, height: img.height, bytes: img.bytes, phash: img.phash };
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr;
    });
    if (pages.length === 0) throw new Error("no pages");
    await db(() =>
      prisma.$transaction([
        prisma.page.deleteMany({ where: { chapterId } }),
        prisma.page.createMany({ data: pages.map((p) => ({ ...p, chapterId })) }),
        prisma.chapter.update({
          where: { id: chapterId },
          data: { status: "READY", pageCount: pages.length, publishedAt: new Date(src.attributes.publishAt), error: null },
        }),
      ]),
    );
    stats.chaptersFetched++;
    stats.pagesStored += pages.length;
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await db(() => prisma.chapter.update({ where: { id: chapterId }, data: { status: "FAILED", error: msg } }));
    throw e;
  }
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
  const verdict = classify({
    title: md.titleFor(m, "en"),
    altTitles: allTitles,
    description: md.descriptionFor(m, "en"),
    tags,
  });

  if (verdict.verdict === "QUARANTINE") {
    stats.worksSuppressed++;
    o.log(`  ${m.id} QUARANTINED (${verdict.reasons.join(", ")}) - metadata only`);
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
    o.log(`  ${m.id} no readable chapters, skipped`);
    return false;
  }
  if (o.dryRun) {
    o.log(`  ${m.id} ${verdict.verdict} langs=${[...byLang].map(([l, c]) => `${l}:${c.length}`).join(",")}`);
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
      const created = await db(() =>
        prisma.work.create({
          data: {
            slug: slug(title) || "work",
            kind: picked.length === 1 ? "ONESHOT" : "SERIES",
            category: isDoujin ? "DOUJINSHI" : "MANGA",
            title,
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
      o.log(`  ${externalId} HELD (review before download) - nothing fetched`);
      continue;
    }

    if (!work.coverKey) {
      try {
        const coverKey = await storeCover(work.mediaId, m);
        if (coverKey) await db(() => prisma.work.update({ where: { id: work.id }, data: { coverKey } }));
      } catch (e) {
        stats.errors.push(`cover ${m.id}: ${(e as Error).message}`);
      }
    }

    // chapters: create rows, then fetch up to maxChapters that are not READY yet
    let fetched = 0;
    for (const { number, ch } of picked) {
      const row = await db(() =>
        prisma.chapter.upsert({
          where: { workId_number: { workId: work.id, number } },
          create: { workId: work.id, number, volume: ch.attributes.volume, title: ch.attributes.title, sourceChapterId: ch.id },
          update: {},
          select: { id: true, status: true },
        }),
      );
      if (row.status === "READY") continue;
      if (fetched >= o.maxChapters || budget.expired) continue;
      try {
        await storeChapter(work, row.id, ch, stats);
        fetched++;
      } catch (e) {
        stats.errors.push(`chapter ${ch.id}: ${(e as Error).message}`);
      }
    }

    // roll up + publish
    const ready = await db(() =>
      prisma.chapter.aggregate({ where: { workId: work.id, status: "READY" }, _count: true, _sum: { pageCount: true } }),
    );
    const fresh = await db(() =>
      prisma.work.findUniqueOrThrow({
        where: { id: work.id },
        select: { coverKey: true, publish: true, needsReview: true, reviewedAt: true, reviewDecision: true },
      }),
    );
    const canAutoPublish =
      ready._count > 0 &&
      !!fresh.coverKey &&
      !fresh.needsReview &&
      (!fresh.reviewedAt || fresh.reviewDecision === "APPROVED") &&
      fresh.publish === "DRAFT";
    await db(() =>
      prisma.work.update({
        where: { id: work.id },
        data: {
          pageCount: ready._sum.pageCount ?? 0,
          ...(canAutoPublish ? { publish: "PUBLISHED" as const, autoPublishedAt: new Date() } : {}),
        },
      }),
    );
    await db(() => prisma.workSource.update({ where: { id: ws!.id }, data: { lastFetchedAt: new Date() } }));
    o.log(
      `  ${externalId} ${canAutoPublish ? "PUBLISHED" : fresh.needsReview ? "HELD (review)" : "draft"} chapters ${ready._count}/${picked.length}`,
    );
  }
  return true;
}

export async function runMangadex(o: IngestOptions): Promise<IngestStats> {
  const stats: IngestStats = {
    worksSeen: 0,
    worksCreated: 0,
    worksHeld: 0,
    worksSuppressed: 0,
    chaptersFetched: 0,
    pagesStored: 0,
    errors: [],
  };
  const budget = new Budget(o.maxMinutes, o.limit);
  const run = o.dryRun
    ? null
    : await db(() => prisma.ingestRun.create({ data: { site: md.SITE, mode: o.mode }, select: { id: true } }));

  const handle = async (m: MdManga, seed: number) => {
    try {
      if (await processManga(m, seed, o, stats, budget)) budget.worksLeft--;
    } catch (e) {
      stats.errors.push(`manga ${m.id}: ${(e as Error).message}`);
      o.log(`  ${m.id} ERROR ${(e as Error).message}`);
    }
  };

  if (o.mode === "popular") {
    const key = "mangadex:popular:offset";
    const saved = await db(() => prisma.setting.findUnique({ where: { key } }));
    let offset = (saved?.value as { offset?: number } | null)?.offset ?? 0;
    while (!budget.expired) {
      if (offset > 9900) {
        o.log("popular window exhausted (MangaDex caps offset at 10000) - windowed backfill needed for the rest");
        break;
      }
      const page = await md.listPopular(offset);
      if (!page.data.length) break;
      const follows = await md.follows(page.data.map((x) => x.id));
      o.log(`popular offset ${offset} (${page.data.length} of ${page.total})`);
      let i = 0;
      for (; i < page.data.length && !budget.expired; i++) {
        const m = page.data[i];
        const known = await db(() =>
          prisma.workSource.count({ where: { site: md.SITE, externalId: { startsWith: `${m.id}:` } } }),
        );
        const suppressed = await db(() => prisma.suppressedSource.count({ where: { site: md.SITE, externalId: m.id } }));
        if (known || suppressed) continue;
        await handle(m, follows[m.id] ?? 0);
      }
      offset += i; // resume exactly where we stopped
      if (!o.dryRun)
        await db(() =>
          prisma.setting.upsert({ where: { key }, create: { key, value: { offset } }, update: { value: { offset } } }),
        );
      if (i < page.data.length) break;
    }
  } else {
    // update: revisit works we already have - new chapters, retries of failed ones
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

  if (run)
    await db(() =>
      prisma.ingestRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          ok: stats.errors.length === 0,
          worksSeen: stats.worksSeen,
          worksCreated: stats.worksCreated,
          worksHeld: stats.worksHeld,
          worksSuppressed: stats.worksSuppressed,
          chaptersFetched: stats.chaptersFetched,
          pagesStored: stats.pagesStored,
          errors: stats.errors.slice(0, 50),
        },
      }),
    );
  return stats;
}
