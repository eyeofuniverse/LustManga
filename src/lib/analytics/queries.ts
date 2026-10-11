import "server-only";
import { Prisma } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { RETENTION_DAYS } from "./config";
import { bounds, fillSeries, pct, type Bounds, type Range } from "./ranges";
import type { CollectorHealth, ContentData, HealthData, Meta, OverviewData, Row, SearchData, TopWork, Totals, VitalSummary } from "./types";

/**
 * Every number is computed in the database: exact however many rows there are, with no sample and no cap. Times are UTC
 * (the stored timestamps are), and a "session" is one visitor's run of page views with no gap longer than 30 minutes.
 * Visitor ids change every UTC day (see visitor.ts), so a "visitor" is a visitor-day.
 */
const q = <T>(fn: () => Promise<T>) => db(fn, 3);

/** Runs a few queries at a time: the database sits behind a small connection pool. */
async function all<T extends readonly (() => Promise<unknown>)[]>(fns: T): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out: unknown[] = [];
  for (let i = 0; i < fns.length; i += 3) out.push(...(await Promise.all(fns.slice(i, i + 3).map((f) => f()))));
  return out as never;
}

const meta = (range: Range, b: Bounds): Meta => ({ range, asOf: new Date().toISOString(), from: b.from.toISOString(), to: b.to.toISOString(), hourly: b.hourly });
const rows = (r: { label: string | null; value: number; extra?: number | null }[], fallback = "Unknown"): Row[] => r.map((x) => ({ label: x.label || fallback, value: x.value, extra: x.extra ?? null }));

/** page views flagged with whether they start a session (first view, or more than 30 minutes since the visitor's previous one) */
const flagged = (from: Date, to: Date) => Prisma.sql`
  SELECT visitor, at, path, kind, "refKind", referrer, "utmSource", "utmMedium", "utmCampaign", seconds,
    CASE WHEN lag(at) OVER w IS NULL OR at - lag(at) OVER w > interval '30 minutes' THEN 1 ELSE 0 END AS new
  FROM "PageView" WHERE at >= ${from} AND at < ${to}
  WINDOW w AS (PARTITION BY visitor ORDER BY at)`;

async function totals(from: Date, to: Date): Promise<Totals> {
  const [r] = await q(
    () => prisma.$queryRaw<{ pv: number; vis: number; sess: number; bounces: number; avg: number | null; reported: number }[]>`
    WITH f AS (${flagged(from, to)}),
    s AS (SELECT visitor, sum(new) OVER (PARTITION BY visitor ORDER BY at) AS sid FROM f),
    sess AS (SELECT visitor, sid, count(*) AS pv FROM s GROUP BY visitor, sid)
    SELECT
      (SELECT count(*) FROM f)::int AS pv,
      (SELECT count(DISTINCT visitor) FROM f)::int AS vis,
      count(*)::int AS sess,
      (count(*) FILTER (WHERE pv = 1))::int AS bounces,
      (SELECT avg(seconds) FROM f WHERE seconds IS NOT NULL)::float AS avg,
      (SELECT count(*) FROM f WHERE seconds IS NOT NULL)::int AS reported
    FROM sess`,
  );
  const sess = r?.sess ?? 0;
  const pv = r?.pv ?? 0;
  return {
    pageviews: pv,
    visitors: r?.vis ?? 0,
    sessions: sess,
    bounceRate: pct(r?.bounces ?? 0, sess),
    pagesPerSession: sess ? Math.round((pv / sess) * 10) / 10 : 0,
    avgSeconds: r?.avg == null ? null : Math.round(r.avg),
    reportedPct: pct(r?.reported ?? 0, pv),
  };
}

async function series(b: Bounds) {
  const unit = b.hourly ? "hour" : "day";
  const fmt = b.hourly ? "YYYY-MM-DD HH24" : "YYYY-MM-DD";
  const r = await q(
    () => prisma.$queryRaw<{ key: string; pageviews: number; visitors: number }[]>`
    SELECT to_char(date_trunc(${unit}, at), ${fmt}) AS key, count(*)::int AS pageviews, count(DISTINCT visitor)::int AS visitors
    FROM "PageView" WHERE at >= ${b.from} AND at < ${b.to} GROUP BY 1`,
  );
  return fillSeries(r, b);
}

async function grouped(col: "country" | "device" | "browser" | "os" | "lang", from: Date, to: Date, limit: number, fallback: string): Promise<Row[]> {
  const c = Prisma.raw(`"${col}"`);
  const r = await q(
    () => prisma.$queryRaw<{ label: string | null; value: number }[]>`
    SELECT ${c} AS label, count(DISTINCT visitor)::int AS value FROM "PageView" WHERE at >= ${from} AND at < ${to}
    GROUP BY 1 ORDER BY value DESC, label LIMIT ${limit}`,
  );
  return rows(r, fallback);
}

async function health(): Promise<CollectorHealth> {
  const hourAgo = new Date(Date.now() - 3_600_000);
  const [a] = await q(
    () => prisma.$queryRaw<{ last: Date | null; hour: number; oldest: Date | null; views: number; events: number; vitals: number }[]>`
    SELECT (SELECT max(at) FROM "PageView") AS last,
           (SELECT count(*) FROM "PageView" WHERE at >= ${hourAgo})::int AS hour,
           (SELECT min(at) FROM "PageView") AS oldest,
           (SELECT count(*) FROM "PageView")::int AS views,
           (SELECT count(*) FROM "AnalyticsEvent")::int AS events,
           (SELECT count(*) FROM "WebVital")::int AS vitals`,
  );
  return {
    lastViewAt: a?.last ? a.last.toISOString() : null,
    viewsLastHour: a?.hour ?? 0,
    oldestAt: a?.oldest ? a.oldest.toISOString() : null,
    rows: { views: a?.views ?? 0, events: a?.events ?? 0, vitals: a?.vitals ?? 0 },
    retentionDays: RETENTION_DAYS,
  };
}

export async function overview(range: Range, b: Bounds = bounds(range)): Promise<OverviewData> {
  const { from, to } = b;
  const fiveMin = new Date(Date.now() - 5 * 60_000);
  const [tot, prev, ser] = await all([() => totals(from, to), () => totals(b.prevFrom, b.prevTo), () => series(b)] as const);
  const [online, topPages, entry] = await all([
    async (): Promise<number> => (await q(() => prisma.$queryRaw<{ n: number }[]>`SELECT count(DISTINCT visitor)::int AS n FROM "PageView" WHERE at >= ${fiveMin}`))[0]?.n ?? 0,
    () =>
      q(
        () => prisma.$queryRaw<{ path: string; kind: string; views: number; visitors: number; avg: number | null }[]>`
      SELECT path, kind, count(*)::int AS views, count(DISTINCT visitor)::int AS visitors, avg(seconds)::float AS avg
      FROM "PageView" WHERE at >= ${from} AND at < ${to} GROUP BY path, kind ORDER BY views DESC, path LIMIT 15`,
      ),
    () =>
      q(
        () => prisma.$queryRaw<{ label: string; value: number }[]>`
      WITH f AS (${flagged(from, to)}) SELECT path AS label, count(*)::int AS value FROM f WHERE new = 1 GROUP BY path ORDER BY value DESC, path LIMIT 12`,
      ),
  ] as const);
  // an "arrival" is the start of a visit, or any page load that came from another site (a visitor can return from a search
  // while their earlier visit is still within 30 minutes)
  const [sources, referrers, campaigns] = await all([
    () =>
      q(
        () => prisma.$queryRaw<{ label: string; value: number }[]>`
      WITH f AS (${flagged(from, to)}) SELECT "refKind" AS label, count(*)::int AS value FROM f WHERE new = 1 OR "refKind" <> 'direct' GROUP BY 1 ORDER BY value DESC`,
      ),
    () =>
      q(
        () => prisma.$queryRaw<{ label: string; value: number; extra: string }[]>`
      SELECT referrer AS label, count(*)::int AS value, min("refKind") AS extra FROM "PageView"
      WHERE at >= ${from} AND at < ${to} AND referrer IS NOT NULL GROUP BY referrer ORDER BY value DESC, referrer LIMIT 15`,
      ),
    () =>
      q(
        () => prisma.$queryRaw<{ label: string; value: number }[]>`
      SELECT concat_ws(' / ', "utmSource", "utmMedium", "utmCampaign") AS label, count(*)::int AS value FROM "PageView"
      WHERE at >= ${from} AND at < ${to} AND ("utmSource" IS NOT NULL OR "utmMedium" IS NOT NULL OR "utmCampaign" IS NOT NULL)
      GROUP BY 1 ORDER BY value DESC, label LIMIT 10`,
      ),
  ] as const);
  const [countries, devices, browsers] = await all([() => grouped("country", from, to, 12, "Unknown"), () => grouped("device", from, to, 5, "Unknown"), () => grouped("browser", from, to, 8, "Other")] as const);
  const [systems, languages, hours, h] = await all([
    () => grouped("os", from, to, 8, "Other"),
    () => grouped("lang", from, to, 8, "Unknown"),
    () =>
      q(
        () => prisma.$queryRaw<{ hour: number; views: number }[]>`
      SELECT EXTRACT(hour FROM at)::int AS hour, count(*)::int AS views FROM "PageView" WHERE at >= ${from} AND at < ${to} GROUP BY 1`,
      ),
    () => health(),
  ] as const);
  const byHour = new Map(hours.map((x) => [x.hour, x.views]));
  return {
    meta: meta(range, b),
    totals: tot,
    previous: prev,
    series: ser,
    online,
    topPages: topPages.map((p) => ({ path: p.path, kind: p.kind, views: p.views, visitors: p.visitors, avgSeconds: p.avg == null ? null : Math.round(p.avg) })),
    entryPages: entry,
    sources: sources.map((s) => ({ label: s.label, value: s.value })),
    referrers: referrers.map((r) => ({ label: r.label, value: r.value, extra: null })),
    campaigns: campaigns.map((c) => ({ label: c.label, value: c.value })),
    countries,
    devices,
    browsers,
    systems,
    languages,
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, views: byHour.get(hour) ?? 0 })),
    health: h,
  };
}

async function topWorks(order: "views" | "reads", from: Date, to: Date): Promise<TopWork[]> {
  const ids =
    order === "views"
      ? await q(
          () => prisma.$queryRaw<{ id: number; n: number }[]>`
        SELECT "workId" AS id, count(*)::int AS n FROM "PageView" WHERE kind = 'work' AND "workId" IS NOT NULL AND at >= ${from} AND at < ${to}
        GROUP BY 1 ORDER BY n DESC, id LIMIT 12`,
        )
      : await q(
          () => prisma.$queryRaw<{ id: number; n: number }[]>`
        SELECT "workId" AS id, count(*)::int AS n FROM "AnalyticsEvent" WHERE name = 'read_start' AND "workId" IS NOT NULL AND at >= ${from} AND at < ${to}
        GROUP BY 1 ORDER BY n DESC, id LIMIT 12`,
        );
  if (!ids.length) return [];
  const list = ids.map((x) => x.id);
  const [views, reads, fin, saves, works] = await Promise.all([
    q(() => prisma.$queryRaw<{ id: number; n: number }[]>`SELECT "workId" AS id, count(*)::int AS n FROM "PageView" WHERE kind = 'work' AND "workId" = ANY(${list}::int[]) AND at >= ${from} AND at < ${to} GROUP BY 1`),
    q(() => prisma.$queryRaw<{ id: number; n: number }[]>`SELECT "workId" AS id, count(*)::int AS n FROM "AnalyticsEvent" WHERE name = 'read_start' AND "workId" = ANY(${list}::int[]) AND at >= ${from} AND at < ${to} GROUP BY 1`),
    q(() => prisma.$queryRaw<{ id: number; n: number }[]>`SELECT "workId" AS id, count(*)::int AS n FROM "AnalyticsEvent" WHERE name = 'read_end' AND value >= total AND "workId" = ANY(${list}::int[]) AND at >= ${from} AND at < ${to} GROUP BY 1`),
    q(() => prisma.$queryRaw<{ id: number; n: number }[]>`SELECT "workId" AS id, (count(*) FILTER (WHERE label = 'add') - count(*) FILTER (WHERE label = 'remove'))::int AS n FROM "AnalyticsEvent" WHERE name = 'favorite' AND "workId" = ANY(${list}::int[]) AND at >= ${from} AND at < ${to} GROUP BY 1`),
    q(() => prisma.work.findMany({ where: { publicId: { in: list } }, select: { publicId: true, title: true, slug: true, coverKey: true } })),
  ]);
  const m = (a: { id: number; n: number }[]) => new Map(a.map((x) => [x.id, x.n]));
  const [v, r, f, s] = [m(views), m(reads), m(fin), m(saves)];
  const info = new Map(works.map((w) => [w.publicId, w]));
  return list
    .map((id) => {
      const w = info.get(id);
      return { publicId: id, title: w?.title ?? `Work #${id} (removed)`, slug: w?.slug ?? "", coverKey: w?.coverKey ?? null, views: v.get(id) ?? 0, reads: r.get(id) ?? 0, finished: f.get(id) ?? 0, saves: Math.max(0, s.get(id) ?? 0) };
    })
    .filter((w) => w.views > 0 || w.reads > 0);
}

export async function content(range: Range, b: Bounds = bounds(range)): Promise<ContentData> {
  const { from, to } = b;
  const [works, reads, funnel] = await all([
    () => topWorks("views", from, to),
    () => topWorks("reads", from, to),
    () =>
      q(
        () => prisma.$queryRaw<{ all: number; work: number; read: number; fin: number }[]>`
      SELECT (SELECT count(DISTINCT visitor) FROM "PageView" WHERE at >= ${from} AND at < ${to})::int AS "all",
             (SELECT count(DISTINCT visitor) FROM "PageView" WHERE kind = 'work' AND at >= ${from} AND at < ${to})::int AS work,
             (SELECT count(DISTINCT visitor) FROM "PageView" WHERE kind = 'read' AND at >= ${from} AND at < ${to})::int AS read,
             (SELECT count(DISTINCT visitor) FROM "AnalyticsEvent" WHERE name = 'read_end' AND value >= total AND at >= ${from} AND at < ${to})::int AS fin`,
      ),
  ] as const);
  const [reading, actions, tags, kinds] = await all([
    () =>
      q(
        () => prisma.$queryRaw<{ opens: number; readers: number; ends: number; fin: number; pages: number | null }[]>`
      SELECT (SELECT count(*) FROM "AnalyticsEvent" WHERE name = 'read_start' AND at >= ${from} AND at < ${to})::int AS opens,
             (SELECT count(DISTINCT visitor) FROM "AnalyticsEvent" WHERE name = 'read_start' AND at >= ${from} AND at < ${to})::int AS readers,
             (SELECT count(*) FROM "AnalyticsEvent" WHERE name = 'read_end' AND at >= ${from} AND at < ${to})::int AS ends,
             (SELECT count(*) FROM "AnalyticsEvent" WHERE name = 'read_end' AND value >= total AND at >= ${from} AND at < ${to})::int AS fin,
             (SELECT avg(LEAST(value, total)) FROM "AnalyticsEvent" WHERE name = 'read_end' AND at >= ${from} AND at < ${to})::float AS pages`,
      ),
    () =>
      q(
        () => prisma.$queryRaw<{ name: string; label: string | null; n: number }[]>`
      SELECT name, label, count(*)::int AS n FROM "AnalyticsEvent" WHERE name IN ('favorite', 'follow', 'download', 'share') AND at >= ${from} AND at < ${to} GROUP BY 1, 2`,
      ),
    () =>
      q(
        () => prisma.$queryRaw<{ label: string; value: number }[]>`
      SELECT path AS label, count(*)::int AS value FROM "PageView" WHERE kind = 'tag' AND at >= ${from} AND at < ${to} GROUP BY path ORDER BY value DESC, path LIMIT 12`,
      ),
    () =>
      q(
        () => prisma.$queryRaw<{ label: string; value: number }[]>`
      SELECT kind AS label, count(*)::int AS value FROM "PageView" WHERE at >= ${from} AND at < ${to} GROUP BY 1 ORDER BY value DESC`,
      ),
  ] as const);
  const rd = reading[0];
  const n = (name: string, label?: string) => actions.filter((a) => a.name === name && (label === undefined || a.label === label)).reduce((s, a) => s + a.n, 0);
  const f = funnel[0];
  return {
    meta: meta(range, b),
    works,
    topRead: reads,
    funnel: [
      { label: "Visitors", value: f?.all ?? 0 },
      { label: "Opened a work page", value: f?.work ?? 0 },
      { label: "Opened the reader", value: f?.read ?? 0 },
      { label: "Finished a chapter", value: f?.fin ?? 0 },
    ],
    reading: {
      chapterOpens: rd?.opens ?? 0,
      readers: rd?.readers ?? 0,
      finishedRate: pct(rd?.fin ?? 0, rd?.ends ?? 0),
      avgPagesRead: rd?.pages == null ? null : Math.round(rd.pages * 10) / 10,
      chaptersPerReader: rd?.readers ? Math.round(((rd.opens ?? 0) / rd.readers) * 10) / 10 : 0,
    },
    actions: { saves: n("favorite", "add"), unsaves: n("favorite", "remove"), follows: n("follow", "add"), downloads: n("download"), shares: n("share") },
    tags,
    kinds,
  };
}

export async function search(range: Range, b: Bounds = bounds(range)): Promise<SearchData> {
  const { from, to } = b;
  const [sum, top, zero] = await all([
    () =>
      q(
        () => prisma.$queryRaw<{ n: number; who: number; z: number }[]>`
      SELECT count(*)::int AS n, count(DISTINCT visitor)::int AS who, (count(*) FILTER (WHERE value = 0))::int AS z
      FROM "AnalyticsEvent" WHERE name = 'search' AND at >= ${from} AND at < ${to}`,
      ),
    () =>
      q(
        () => prisma.$queryRaw<{ query: string; count: number; avg: number | null; zero: number }[]>`
      SELECT label AS query, count(*)::int AS count, avg(value)::float AS avg, (count(*) FILTER (WHERE value = 0))::int AS zero
      FROM "AnalyticsEvent" WHERE name = 'search' AND label IS NOT NULL AND at >= ${from} AND at < ${to} GROUP BY label ORDER BY count DESC, label LIMIT 25`,
      ),
    () =>
      q(
        () => prisma.$queryRaw<{ query: string; count: number }[]>`
      SELECT label AS query, count(*)::int AS count FROM "AnalyticsEvent" WHERE name = 'search' AND value = 0 AND label IS NOT NULL AND at >= ${from} AND at < ${to}
      GROUP BY label ORDER BY count DESC, label LIMIT 25`,
      ),
  ] as const);
  const s = sum[0];
  return {
    meta: meta(range, b),
    searches: s?.n ?? 0,
    searchers: s?.who ?? 0,
    zeroRate: pct(s?.z ?? 0, s?.n ?? 0),
    top: top.map((t) => ({ query: t.query, count: t.count, avgResults: t.avg == null ? null : Math.round(t.avg), zero: t.zero })),
    zero,
  };
}

async function vitalSummary(from: Date, to: Date, device: "mobile" | "desktop" | null): Promise<VitalSummary[]> {
  const dev = device ? Prisma.sql`AND device = ${device}` : Prisma.empty;
  const r = await q(
    () => prisma.$queryRaw<{ metric: string; p75: number | null; n: number; good: number; needs: number; poor: number }[]>`
    SELECT metric, percentile_cont(0.75) WITHIN GROUP (ORDER BY value)::float AS p75, count(*)::int AS n,
           (count(*) FILTER (WHERE rating = 'good'))::int AS good,
           (count(*) FILTER (WHERE rating = 'needs-improvement'))::int AS needs,
           (count(*) FILTER (WHERE rating = 'poor'))::int AS poor
    FROM "WebVital" WHERE at >= ${from} AND at < ${to} ${dev} GROUP BY metric`,
  );
  const by = new Map(r.map((x) => [x.metric, x]));
  return ["LCP", "INP", "CLS", "FCP", "TTFB"].map((metric) => {
    const x = by.get(metric);
    return { metric, p75: x?.p75 == null ? null : Math.round(x.p75), samples: x?.n ?? 0, good: x?.good ?? 0, needs: x?.needs ?? 0, poor: x?.poor ?? 0 };
  });
}

export async function healthReport(range: Range, b: Bounds = bounds(range)): Promise<HealthData> {
  const { from, to } = b;
  const [all_, mobile, desktop] = await all([() => vitalSummary(from, to, null), () => vitalSummary(from, to, "mobile"), () => vitalSummary(from, to, "desktop")] as const);
  const [nf, gate, h] = await all([
    () =>
      q(
        () => prisma.$queryRaw<{ label: string | null; value: number }[]>`
      SELECT path AS label, count(*)::int AS value FROM "AnalyticsEvent" WHERE name = 'not_found' AND at >= ${from} AND at < ${to} GROUP BY path ORDER BY value DESC, path LIMIT 20`,
      ),
    () =>
      q(
        () => prisma.$queryRaw<{ shown: number; passed: number }[]>`
      SELECT (SELECT count(DISTINCT visitor) FROM "PageView" WHERE gated AND at >= ${from} AND at < ${to})::int AS shown,
             (SELECT count(DISTINCT e.visitor) FROM "AnalyticsEvent" e WHERE e.name = 'age_gate' AND e.at >= ${from} AND e.at < ${to}
                AND EXISTS (SELECT 1 FROM "PageView" p WHERE p.visitor = e.visitor AND p.gated AND p.at >= ${from} AND p.at < ${to}))::int AS passed`,
      ),
    () => health(),
  ] as const);
  const g = gate[0];
  return {
    meta: meta(range, b),
    vitals: { all: all_, mobile, desktop },
    notFound: rows(nf, "(unknown)"),
    notFoundTotal: nf.reduce((s, x) => s + x.value, 0),
    gate: { shown: g?.shown ?? 0, passed: g?.passed ?? 0, rate: pct(g?.passed ?? 0, g?.shown ?? 0) },
    health: h,
  };
}
