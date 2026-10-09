import { prisma, db } from "@/lib/db";
import { pool } from "@/lib/http";
import * as md from "@/lib/sources/mangadex";
import * as hm from "@/lib/sources/hitomi";
import * as h2r from "@/lib/sources/hentai2read";
import * as im from "@/lib/sources/imengine";
import type { SourceStats } from "@/lib/sources/stats";
import {
  GROWTH_SCALE, POPULARITY_REFS, WINDOW_DAYS, dayString, growthScore, popularityScore, rankScore, statsToFields, windowGainSince, type Snap, type Window,
} from "@/lib/signals";

/**
 * Pulls what the SOURCE sites say about our works and writes it down, so Popular, Trending and Top rated reflect the
 * wider readership instead of waiting for visitors to our own (new) site:
 *
 *  - MangaDex   followers and ratings for every title; follower growth between daily snapshots; its "popular new
 *               titles" charts (last day / week / month) for momentum on new releases.
 *  - Hitomi     its own popular-today / this-week / this-month / this-year charts, per language.
 *  - the rest   (Hentai2Read, HentaiFox, HentaiEra, AsmHentai, nhentai.xxx) each work's own page: favourites, likes and
 *               dislikes, bookmarks, views, rating, upload time. A daily snapshot of those numbers gives growth, and
 *               a work's favourites since its upload date give the momentum of a brand-new hit.
 *
 * Every number is stored per work (srcFavorites, srcViews, srcRating, srcVotes, trendDay/Week/Month, seedPopularity)
 * and the public sorts read those columns. Safe to run as often as you like: it only overwrites with fresh figures.
 */
export interface SignalsOptions {
  sources: ("mangadex" | "hitomi" | "stats")[];
  /** stop starting new page reads after this many minutes (the stalest works are read first, so the rest wait for next time) */
  statsMinutes: number;
  /** at most this many works per site per run */
  statsLimit: number;
  dryRun?: boolean;
  log: (m: string) => void;
}

export interface SignalsSummary {
  source: string;
  works: number;
  updated: number;
  note?: string;
  error?: string;
}

const CHUNK = 400;
const NEW_POPULAR_LENGTH = 300;

interface Row {
  id: string;
  /** set the all-time popularity to exactly this (a source that publishes real counts) */
  seed?: number;
  favorites?: number;
  views?: number;
  rating?: number | null;
  votes?: number;
  trendDay?: number;
  trendWeek?: number;
  trendMonth?: number;
  sourceAt?: Date;
  /** the work's own page was read (or tried) just now */
  statsRead?: boolean;
}

const chunks = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));
const nz = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
/** one row per work: a work with two source ids on the same site would otherwise be written twice in one statement */
const uniqueById = <T extends { id: string }>(rows: T[]): T[] => [...new Map(rows.map((r) => [r.id, r])).values()];

/** Write a batch of per-work numbers in a few statements (fields left out keep their value). */
async function applyRows(input: Row[], dryRun?: boolean): Promise<number> {
  const rows = uniqueById(input);
  if (dryRun || !rows.length) return rows.length;
  for (const part of chunks(rows, CHUNK)) {
    await db(() =>
      prisma.$executeRaw`
        UPDATE "Work" w SET
          "seedPopularity" = COALESCE(v.seed, w."seedPopularity"),
          "srcFavorites" = COALESCE(v.fav, w."srcFavorites"),
          "srcViews" = COALESCE(v.views, w."srcViews"),
          "srcRating" = COALESCE(v.rating, w."srcRating"),
          "srcVotes" = COALESCE(v.votes, w."srcVotes"),
          "trendDay" = COALESCE(v.td, w."trendDay"),
          "trendWeek" = COALESCE(v.tw, w."trendWeek"),
          "trendMonth" = COALESCE(v.tm, w."trendMonth"),
          "sourceAt" = COALESCE(v.sat, w."sourceAt"),
          "statsAt" = CASE WHEN v.stat THEN now() ELSE w."statsAt" END,
          "signalsAt" = now()
        FROM (
          SELECT unnest(${part.map((r) => r.id)}::text[]) AS id,
                 unnest(${part.map((r) => nz(r.seed))}::int[]) AS seed,
                 unnest(${part.map((r) => nz(r.favorites))}::int[]) AS fav,
                 unnest(${part.map((r) => nz(r.views))}::int[]) AS views,
                 unnest(${part.map((r) => nz(r.rating))}::float8[]) AS rating,
                 unnest(${part.map((r) => nz(r.votes))}::int[]) AS votes,
                 unnest(${part.map((r) => nz(r.trendDay))}::int[]) AS td,
                 unnest(${part.map((r) => nz(r.trendWeek))}::int[]) AS tw,
                 unnest(${part.map((r) => nz(r.trendMonth))}::int[]) AS tm,
                 unnest(${part.map((r) => (r.sourceAt ? r.sourceAt.toISOString() : null))}::text[]::timestamptz[]) AS sat,
                 unnest(${part.map((r) => !!r.statsRead)}::boolean[]) AS stat
        ) v WHERE w.id = v.id`,
    );
  }
  return rows.length;
}

interface SnapRow {
  id: string;
  favorites?: number;
  views?: number;
  score?: number;
}

/** Today's photograph of each work's source numbers (one row per work per day, overwritten if taken twice). */
async function saveSnapshots(input: SnapRow[], day: string, dryRun?: boolean) {
  const rows = uniqueById(input);
  if (dryRun || !rows.length) return;
  for (const part of chunks(rows, CHUNK)) {
    await db(() =>
      prisma.$executeRaw`
        INSERT INTO "SignalSnapshot" ("workId", day, favorites, views, score)
        SELECT unnest(${part.map((r) => r.id)}::text[]), ${day}::date,
               unnest(${part.map((r) => r.favorites ?? 0)}::int[]), unnest(${part.map((r) => r.views ?? 0)}::int[]), unnest(${part.map((r) => r.score ?? 0)}::int[])
        ON CONFLICT ("workId", day) DO UPDATE SET favorites = EXCLUDED.favorites, views = EXCLUDED.views, score = EXCLUDED.score`,
    );
  }
}

interface History {
  /** first day we took any snapshot for this source */
  start: string;
  byWork: Map<string, { day: string; favorites: number; views: number; score: number }[]>;
}

/** The last ~5 weeks of snapshots for some works, and when this source's history began. */
async function loadHistory(site: string, workIds: string[], today: string): Promise<History> {
  const from = dayString(Date.parse(`${today}T00:00:00Z`) - 36 * 86_400_000);
  const first = await db(() =>
    prisma.$queryRaw<{ d: string | null }[]>`
      SELECT min(s.day)::text AS d FROM "SignalSnapshot" s JOIN "WorkSource" ws ON ws."workId" = s."workId" WHERE ws.site = ${site}`,
  );
  const byWork: History["byWork"] = new Map();
  for (const part of chunks(workIds, 2000)) {
    const rows = await db(() =>
      prisma.$queryRaw<{ workId: string; day: string; favorites: number; views: number; score: number }[]>`
        SELECT "workId", day::text AS day, favorites, views, score FROM "SignalSnapshot" WHERE "workId" = ANY(${part}::text[]) AND day >= ${from}::date`,
    );
    for (const r of rows) (byWork.get(r.workId) ?? byWork.set(r.workId, []).get(r.workId)!).push(r);
  }
  return { start: first[0]?.d ?? today, byWork };
}

const WINDOWS: Window[] = ["day", "week", "month"];

/** Growth in one snapshot field over each window, turned into momentum scores. */
function trendFrom(
  hist: History,
  workId: string,
  today: string,
  field: "favorites" | "views" | "score",
  toScore: (gain: number, w: Window) => number,
  /** a work published after the history began is compared with zero on its publish day: its favourites since then are its growth */
  publishedAt?: Date | null,
): Record<Window, number> {
  const snaps: Snap[] = (hist.byWork.get(workId) ?? []).map((s) => ({ day: s.day, value: s[field] }));
  const out = { day: 0, week: 0, month: 0 } as Record<Window, number>;
  for (const w of WINDOWS) {
    const gain = windowGainSince(snaps, today, WINDOW_DAYS[w], publishedAt);
    out[w] = gain == null ? 0 : toScore(gain, w);
  }
  return out;
}

/* ───────────────────────────── MangaDex ───────────────────────────── */

async function refreshMangadex(o: SignalsOptions): Promise<SignalsSummary> {
  const sources = await db(() => prisma.workSource.findMany({ where: { site: md.SITE, work: { publish: "PUBLISHED" } }, select: { workId: true, externalId: true } }));
  const byTitle = new Map<string, string[]>(); // MangaDex title id -> our works (one per language)
  for (const s of sources) {
    const id = s.externalId.split(":")[0];
    (byTitle.get(id) ?? byTitle.set(id, []).get(id)!).push(s.workId);
  }
  const titleIds = [...byTitle.keys()];
  if (!titleIds.length) return { source: md.SITE, works: 0, updated: 0, note: "no MangaDex works yet" };

  const stat: Record<string, md.MdStats> = {};
  for (const part of chunks(titleIds, 100)) Object.assign(stat, await md.stats(part));

  // "popular new titles" for the last day, week and month
  const now = Date.now();
  const chart: Record<Window, Map<string, number>> = { day: new Map(), week: new Map(), month: new Map() };
  for (const w of WINDOWS) {
    const since = new Date(now - WINDOW_DAYS[w] * 86_400_000).toISOString().slice(0, 19);
    const ids: string[] = [];
    for (let offset = 0; offset < NEW_POPULAR_LENGTH; offset += 100) {
      const r = await md.listNewPopular(since, offset, 100);
      ids.push(...r.data.map((m) => m.id));
      if (offset + 100 >= r.total) break;
    }
    ids.forEach((id, rank) => chart[w].set(id, rankScore(rank, NEW_POPULAR_LENGTH)));
  }

  const today = dayString(now);
  const workIds = [...byTitle.values()].flat();
  const seeds = new Map<string, number>();
  for (const part of chunks(workIds, 2000)) for (const w of await db(() => prisma.work.findMany({ where: { id: { in: part } }, select: { id: true, seedPopularity: true } }))) seeds.set(w.id, w.seedPopularity);

  // history is read BEFORE today's snapshot is saved, then today's reading is added by hand, so growth is exact either way
  const hist = await loadHistory(md.SITE, workIds, today);
  const todays: SnapRow[] = [...byTitle].flatMap(([t, ids]) => ids.map((id) => ({ id, favorites: stat[t]?.follows ?? 0 })));
  for (const s of todays) hist.byWork.set(s.id, [...(hist.byWork.get(s.id) ?? []).filter((h) => h.day !== today), { day: today, favorites: s.favorites ?? 0, views: 0, score: 0 }]);
  await saveSnapshots(todays, today, o.dryRun);

  const rows: Row[] = [];
  for (const [t, ids] of byTitle) {
    const s = stat[t];
    if (!s) continue;
    for (const id of ids) {
      const growth = trendFrom(hist, id, today, "favorites", (gain, w) => growthScore(gain, w, GROWTH_SCALE.mangadex));
      rows.push({
        id,
        favorites: s.follows,
        rating: s.rating,
        votes: s.votes,
        seed: popularityScore({ favorites: s.follows, rating: s.rating, votes: s.votes }, POPULARITY_REFS.mangadex, seeds.get(id) ?? 0),
        trendDay: Math.max(growth.day, chart.day.get(t) ?? 0),
        trendWeek: Math.max(growth.week, chart.week.get(t) ?? 0),
        trendMonth: Math.max(growth.month, chart.month.get(t) ?? 0),
      });
    }
  }
  const updated = await applyRows(rows, o.dryRun);
  const inChart = rows.filter((r) => (r.trendWeek ?? 0) > 0).length;
  return { source: md.SITE, works: workIds.length, updated, note: `${Object.keys(stat).length} titles' stats, ${inChart} with weekly momentum, history since ${hist.start}` };
}

/* ───────────────────────────── Hitomi ───────────────────────────── */

async function refreshHitomi(o: SignalsOptions): Promise<SignalsSummary> {
  const sources = await db(() =>
    prisma.workSource.findMany({ where: { site: hm.SITE, work: { publish: "PUBLISHED" } }, select: { workId: true, externalId: true, work: { select: { language: true } } } }),
  );
  const byLang = new Map<string, Map<string, string>>(); // language -> gallery id -> our work
  for (const s of sources) {
    const lang = s.work.language;
    if (!hm.LANGUAGES[lang]) continue;
    (byLang.get(lang) ?? byLang.set(lang, new Map()).get(lang)!).set(s.externalId, s.workId);
  }
  const rows: Row[] = [];
  let listed = 0;
  for (const [lang, works] of byLang) {
    const rank = async (window: hm.HitomiWindow) => {
      const { ids } = await hm.listIds(hm.windowPath(window, lang), 0, 2000);
      return new Map(ids.map((id, i) => [String(id), rankScore(i, 2000)]));
    };
    const [today, week, month, year] = [await rank("today"), await rank("week"), await rank("month"), await rank("year")];
    for (const [gid, workId] of works) {
      const row: Row = { id: workId, trendDay: today.get(gid) ?? 0, trendWeek: week.get(gid) ?? 0, trendMonth: month.get(gid) ?? 0 };
      const y = year.get(gid);
      if (y !== undefined) row.seed = y; // the year chart is Hitomi's all-time-ish popularity
      if ((row.trendWeek ?? 0) > 0) listed++;
      rows.push(row);
    }
  }
  const updated = await applyRows(rows, o.dryRun);
  return { source: hm.SITE, works: rows.length, updated, note: `${byLang.size} language(s), ${listed} in a weekly chart` };
}

/* ───────────────────── Hentai2Read and the clone sites: each work's own page ───────────────────── */

const PAGE_SITES = [h2r.SITE, ...Object.keys(im.SITES)];

/** Read one work's page on its source: the counters on it (null = the work is gone from the source). */
async function readStats(site: string, externalId: string): Promise<SourceStats | null> {
  return site === h2r.SITE ? h2r.getPageStats(externalId) : im.getPageStats(im.SITES[site], externalId);
}

async function refreshSiteStats(site: string, deadline: number, o: SignalsOptions): Promise<SignalsSummary> {
  // the works whose page was read longest ago (or never) come first, so successive runs cover the whole catalogue
  const queue = await db(() =>
    prisma.$queryRaw<{ workId: string; externalId: string; seed: number }[]>`
      SELECT ws."workId", ws."externalId", w."seedPopularity" AS seed
      FROM "WorkSource" ws JOIN "Work" w ON w.id = ws."workId"
      WHERE ws.site = ${site} AND w.publish = 'PUBLISHED'
      ORDER BY w."statsAt" ASC NULLS FIRST, w.id LIMIT ${o.statsLimit}`,
  );
  if (!queue.length) return { source: site, works: 0, updated: 0, note: "no works" };

  const today = dayString(Date.now());
  const read: { workId: string; stats: SourceStats | null }[] = [];
  let failed = 0;
  let stopped = false;
  await pool(queue, 2, async (q) => {
    if (Date.now() > deadline) return void (stopped = true);
    try {
      read.push({ workId: q.workId, stats: await readStats(site, q.externalId) });
    } catch {
      failed++;
    }
  });

  const seen = read.filter((r) => r.stats);
  const hist = await loadHistory(site, seen.map((r) => r.workId), today);
  const known = new Map(
    (await db(() => prisma.work.findMany({ where: { id: { in: seen.map((r) => r.workId) } }, select: { id: true, sourceAt: true } }))).map((w) => [w.id, w.sourceAt]),
  );
  const snaps: SnapRow[] = [];
  const rows: Row[] = [];
  const scale = GROWTH_SCALE[site] ?? 0.1;
  for (const { workId, stats } of read) {
    if (!stats) {
      rows.push({ id: workId, statsRead: true }); // gone or unreadable: rotate it to the back of the queue
      continue;
    }
    const f = statsToFields(site, stats);
    const publishedAt = f.sourceAt ?? known.get(workId) ?? null;
    snaps.push({ id: workId, favorites: stats.favorites ?? 0, views: stats.views ?? 0 });
    hist.byWork.set(workId, [...(hist.byWork.get(workId) ?? []).filter((h) => h.day !== today), { day: today, favorites: stats.favorites ?? 0, views: stats.views ?? 0, score: 0 }]);
    const t = trendFrom(hist, workId, today, "favorites", (gain, w) => growthScore(gain, w, scale), publishedAt);
    rows.push({
      id: workId,
      statsRead: true,
      favorites: f.srcFavorites,
      views: f.srcViews,
      rating: f.srcRating ?? null,
      votes: f.srcVotes,
      seed: f.seedPopularity,
      sourceAt: f.sourceAt,
      trendDay: t.day,
      trendWeek: t.week,
      trendMonth: t.month,
    });
  }
  await saveSnapshots(snaps, today, o.dryRun);
  const updated = await applyRows(rows, o.dryRun);
  const hot = rows.filter((r) => (r.trendWeek ?? 0) > 0).length;
  return {
    source: site,
    works: queue.length,
    updated,
    note: `${seen.length} read, ${failed} failed, ${read.length - seen.length} gone, ${hot} with weekly momentum${stopped ? ", time budget reached (the rest next run)" : ""}, history since ${hist.start}`,
  };
}

async function refreshStats(o: SignalsOptions): Promise<SignalsSummary[]> {
  const deadline = Date.now() + o.statsMinutes * 60_000;
  // the sites are separate hosts, each with its own polite pace, so they are read side by side
  return Promise.all(
    PAGE_SITES.map((site) =>
      refreshSiteStats(site, deadline, o).catch((e): SignalsSummary => ({ source: site, works: 0, updated: 0, error: (e as Error).message })),
    ),
  );
}

/* ───────────────────────────── entry point ───────────────────────────── */

/** Refresh the source signals for the chosen sources. One source failing never stops the others. */
export async function refreshSignals(o: SignalsOptions): Promise<SignalsSummary[]> {
  const out: SignalsSummary[] = [];
  const run = async (name: string, fn: () => Promise<SignalsSummary | SignalsSummary[]>) => {
    o.log(`${name}: refreshing`);
    try {
      const r = await fn();
      for (const s of Array.isArray(r) ? r : [r]) {
        out.push(s);
        o.log(`${s.source}: ${s.error ? `FAILED ${s.error}` : `${s.updated} of ${s.works} work(s) updated${o.dryRun ? " (dry run)" : ""}${s.note ? ` - ${s.note}` : ""}`}`);
      }
    } catch (e) {
      out.push({ source: name, works: 0, updated: 0, error: (e as Error).message });
      o.log(`${name}: FAILED ${(e as Error).message}`);
    }
  };
  if (o.sources.includes("mangadex")) await run("mangadex", () => refreshMangadex(o));
  if (o.sources.includes("hitomi")) await run("hitomi", () => refreshHitomi(o));
  if (o.sources.includes("stats")) await run("stats", () => refreshStats(o));
  return out;
}
