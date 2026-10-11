// First-party analytics, end to end.
//   1. the collector over HTTP: what it stores, what it refuses, and that nothing identifying is kept
//   2. the report queries, against a small dataset with known answers in a long-past window (so real traffic cannot interfere)
//   3. a real browser: page views, time on page, events and the privacy opt-outs, as a visitor would trigger them
// Needs a server started with ANALYTICS_FORCE=1 (analytics is off on local builds otherwise):
//   ANALYTICS_FORCE=1 NEXT_PUBLIC_SITE_URL=http://localhost:3201 npx next start -p 3201
//   BASE_URL=http://localhost:3201 npm run analytics:test
// Everything it writes is removed again at the end (and at the start, in case an earlier run was cut short). The one exception:
// speed samples have no visitor id, so they are removed by time window and only when no real traffic overlapped.
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";
import { AGE_COOKIE } from "../src/lib/prefs";
import { overview, content, search, healthReport } from "../src/lib/analytics/queries";
import { visitorId } from "../src/lib/analytics/visitor";
import type { Bounds } from "../src/lib/analytics/ranges";

const BASE = (process.env.BASE_URL ?? "http://localhost:3201").replace(/\/$/, "");
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const MARK = "zz"; // the language every test request declares: the one thing real visitors never send
const MAGIC = 599_977; // a speed sample no real visitor can produce

let fails = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? `  [${extra}]` : ""}`);
};
const until = async <T,>(fn: () => Promise<T | null | false | undefined>, ms = 10_000): Promise<T | null> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MINE = [{ lang: MARK }, { visitor: { startsWith: "zztest" } }, { utmCampaign: "zz-e2e" }];
const STARTED = new Date();
async function cleanup() {
  const ids = (await prisma.pageView.findMany({ where: { OR: MINE }, select: { visitor: true }, distinct: ["visitor"] })).map((v) => v.visitor);
  await prisma.analyticsEvent.deleteMany({ where: { OR: [{ visitor: { in: ids } }, { visitor: { startsWith: "zztest" } }, { id: { startsWith: "zzt" } }] } });
  // real visitors in the test's time window? (checked before our own rows are removed)
  const realInWindow = await prisma.pageView.count({ where: { at: { gte: STARTED }, NOT: { OR: MINE } } });
  await prisma.pageView.deleteMany({ where: { OR: MINE } });
  await prisma.webVital.deleteMany({ where: { OR: [{ value: MAGIC }, { at: { lt: new Date("2021-01-01") } }] } });
  // A browser's speed samples carry no visitor id (on purpose), so the samples this test's browsers sent cannot be told from a
  // real visitor's. They are removed by time window, and only when no real page view happened in that window.
  if (realInWindow === 0) await prisma.webVital.deleteMany({ where: { at: { gte: STARTED } } });
  else console.log(`note: ${realInWindow} real page view(s) during the test, so its speed samples were left in place`);
}

let n = 0;
const nid = () => `zzt${String(++n).padStart(9, "0")}abc`; // 15 characters: a valid client id
const ip = (k: number) => `203.0.113.${k}`;

async function post(items: unknown[], o: { ip?: string; ua?: string; headers?: Record<string, string>; raw?: string } = {}) {
  return fetch(`${BASE}/api/t`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": o.ua ?? CHROME, "x-forwarded-for": o.ip ?? ip(10), "accept-language": MARK, "cf-ipcountry": "JP", ...o.headers },
    body: o.raw ?? JSON.stringify({ items }),
  });
}
const view = (id: string, path: string, extra: object = {}) => ({ t: "view", id, path, ...extra });

await cleanup();
try {
  /* ───────────── 1. the collector ───────────── */
  console.log("\n— the collector");
  const id1 = nid();
  const A = ip(11);
  let r = await post([view(id1, "/g/5966-some-title?utm=1", { ref: "https://www.google.com/search?q=secret+words", us: " Newsletter ", um: "EMAIL", uc: "launch", gate: true })], { ip: A, ua: IPHONE });
  ok(r.status === 204, "a page view is accepted with an empty answer", String(r.status));
  const row = await until(() => prisma.pageView.findUnique({ where: { id: id1 } }));
  ok(!!row, "and stored");
  if (row) {
    ok(row.path === "/g/5966" && row.kind === "work" && row.workId === 5966, "the path is normalised: no slug, no query, work id extracted", `${row.path} ${row.kind} ${row.workId}`);
    ok(row.referrer === "google.com" && row.refKind === "search", "the referrer is kept as a host only and classed as search", `${row.referrer} ${row.refKind}`);
    ok(row.utmSource === "newsletter" && row.utmMedium === "email" && row.utmCampaign === "launch", "campaign tags are lower-cased and trimmed");
    ok(row.country === "JP" && row.lang === MARK, "the country comes from the network header, the language from the browser");
    ok(row.device === "mobile" && row.browser === "Safari" && row.os === "iOS", "device, browser and system are read from the user agent", `${row.device} ${row.browser} ${row.os}`);
    ok(row.gated === true && row.seconds === null, "the age-gate flag is kept; time is unknown until the visitor leaves");
    ok(row.visitor === visitorId(A, IPHONE), "the visitor id is the salted daily hash of address + browser");
    const dump = JSON.stringify(row);
    ok(!dump.includes(A) && !dump.includes("Mozilla") && !dump.includes("secret") && !/203\.0\.113/.test(dump), "no IP address, user agent or search words anywhere in the stored row");
  }

  r = await post([{ t: "leave", id: id1, sec: 42 }], { ip: A, ua: IPHONE });
  ok((await until(async () => (await prisma.pageView.findUnique({ where: { id: id1 } }))?.seconds === 42 && true)) === true, "time on page is recorded when the visitor leaves");
  await post([{ t: "leave", id: id1, sec: 17 }], { ip: A, ua: IPHONE });
  await sleep(700);
  ok((await prisma.pageView.findUnique({ where: { id: id1 } }))?.seconds === 42, "a later, smaller report never lowers it (the furthest value wins)");
  await post([{ t: "leave", id: id1, sec: 99 }], { ip: A, ua: IPHONE });
  ok((await until(async () => (await prisma.pageView.findUnique({ where: { id: id1 } }))?.seconds === 99 && true)) === true, "and a larger one raises it");
  await post([{ t: "leave", id: id1, sec: 3600 }], { ip: A, ua: IPHONE });
  await post([{ t: "leave", id: id1, sec: 99999 }], { ip: A, ua: IPHONE });
  await sleep(700);
  ok(((await prisma.pageView.findUnique({ where: { id: id1 } }))?.seconds ?? 0) <= 3600, "time on page is capped at an hour (an absurd value is refused)");

  const idX = nid();
  await post([view(idX, "/browse")], { ip: A, ua: IPHONE });
  await until(() => prisma.pageView.findUnique({ where: { id: idX } }));
  await post([{ t: "leave", id: idX, sec: 500 }], { ip: ip(12), ua: IPHONE });
  await sleep(700);
  ok((await prisma.pageView.findUnique({ where: { id: idX } }))?.seconds === null, "another visitor cannot set the time on someone else's page view");
  await post([{ t: "leave", id: idX, sec: 8 }], { ip: A, ua: IPHONE });
  ok((await until(async () => (await prisma.pageView.findUnique({ where: { id: idX } }))?.seconds === 8 && true)) === true, "the owner can");

  await post([view(id1, "/browse")], { ip: A, ua: IPHONE });
  await sleep(500);
  ok((await prisma.pageView.count({ where: { id: id1 } })) === 1 && (await prisma.pageView.findUnique({ where: { id: id1 } }))?.path === "/g/5966", "the same id twice is one page view, the first one");

  // events
  const B = ip(13);
  const sId = nid(), s2 = nid(), s3 = nid(), s4 = nid();
  await post([{ t: "ev", id: sId, n: "search", path: "/search?q=x", label: "  Big   BREASTS ", v: 120 }, { t: "ev", id: s2, n: "search", label: "mail me a@b.com", v: 0 }, { t: "ev", id: s3, n: "read_start", work: 5966, v: 1, path: "/read/5966/1?p=3" }, { t: "ev", id: s4, n: "bogus" }], { ip: B });
  const ev = await until(async () => (await prisma.analyticsEvent.findUnique({ where: { id: sId } })) ?? null);
  ok(ev?.label === "big breasts" && ev.value === 120 && ev.path === "/search", "a search is stored lower-cased with its result count, on the normalised path", JSON.stringify(ev));
  ok((await prisma.analyticsEvent.count({ where: { id: s2 } })) === 0, "a search that looks like an email address is not stored");
  ok((await prisma.analyticsEvent.count({ where: { id: s4 } })) === 0, "an unknown event name is dropped");
  const rs = await prisma.analyticsEvent.findUnique({ where: { id: s3 } });
  ok(rs?.workId === 5966 && rs.path === "/read/5966", "a chapter opened keeps the work id and the normalised reader path");

  const endId = nid();
  await post([{ t: "ev", id: endId, n: "read_end", work: 5966, v: 5, tot: 30, path: "/read/5966/1" }], { ip: B });
  await until(async () => (await prisma.analyticsEvent.findUnique({ where: { id: endId } })) ?? null);
  await post([{ t: "ev", id: endId, n: "read_end", work: 5966, v: 31, tot: 30, path: "/read/5966/1" }], { ip: B });
  ok((await until(async () => (await prisma.analyticsEvent.findUnique({ where: { id: endId } }))?.value === 31 && true)) === true, "'how far did they read' moves forward as they read on");
  await post([{ t: "ev", id: endId, n: "read_end", work: 5966, v: 2, tot: 30, path: "/read/5966/1" }], { ip: B });
  await post([{ t: "ev", id: endId, n: "read_end", work: 5966, v: 30, tot: 30, path: "/read/5966/1" }], { ip: ip(14) });
  await sleep(800);
  const end = await prisma.analyticsEvent.findUnique({ where: { id: endId } });
  ok(end?.value === 31 && (await prisma.analyticsEvent.count({ where: { id: endId } })) === 1, "it never moves back, and another visitor cannot overwrite it", String(end?.value));

  // speed samples
  await post([{ t: "vit", path: "/g/5966-x", items: [{ m: "CLS", v: MAGIC / 1000, r: "poor" }, { m: "LCP", v: 1234.6, r: "good" }] }], { ip: ip(15) });
  const cls = await until(() => prisma.webVital.findFirst({ where: { metric: "CLS", value: MAGIC } }));
  ok(cls?.kind === "work" && cls.device === "desktop" && cls.rating === "poor", "speed samples keep the page kind and device; CLS is stored times 1000");
  const lcp = await prisma.webVital.findFirst({ where: { metric: "LCP", at: { gte: new Date(Date.now() - 30_000) }, value: 1235 } });
  ok(!!lcp, "milliseconds are rounded to whole numbers");
  if (lcp) await prisma.webVital.deleteMany({ where: { id: lcp.id } });

  // refusals
  console.log("\n— what it refuses");
  const before = await prisma.pageView.count({ where: { lang: MARK } });
  const cases: [string, Parameters<typeof post>[1], string][] = [
    ["Do Not Track", { headers: { dnt: "1" }, ip: ip(20) }, "204"],
    ["Global Privacy Control", { headers: { "sec-gpc": "1" }, ip: ip(21) }, "204"],
    ["the test-run cookie", { headers: { cookie: "lm_nocount=1" }, ip: ip(22) }, "204"],
    ["a signed-in admin (session cookie)", { headers: { cookie: "lm_session=abc" }, ip: ip(23) }, "204"],
    ["a crawler", { ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", ip: ip(24) }, "204"],
    ["a command-line tool", { ua: "curl/8.4.0", ip: ip(25) }, "204"],
    ["a missing user agent", { ua: "", ip: ip(26) }, "204"],
  ];
  for (const [name, o, want] of cases) {
    const res = await post([view(nid(), "/")], o);
    ok(String(res.status) === want, `${name} is not measured (silent ${want})`, String(res.status));
  }
  r = await post([view(nid(), "/")], { headers: { origin: "https://evil.example" }, ip: ip(27) });
  ok(r.status === 403, "a request claiming to come from another website is refused", String(r.status));
  r = await post([view(nid(), "/")], { headers: { origin: new URL(BASE).origin }, ip: ip(28) });
  ok(r.status === 204, "one from the site itself is accepted", String(r.status));
  r = await post([view(nid(), "/console/works"), view(nid(), "/api/t"), view(nid(), "javascript:alert(1)")], { ip: ip(29) });
  ok(r.status === 204, "the console, the API and non-paths are accepted but dropped");
  r = await post([], { raw: "{not json", ip: ip(30) });
  ok(r.status === 400, "malformed JSON is a 400", String(r.status));
  r = await post([], { raw: JSON.stringify({ nope: 1 }), ip: ip(31) });
  ok(r.status === 400, "the wrong shape is a 400", String(r.status));
  r = await post([], { raw: JSON.stringify({ items: [view(nid(), "/")], pad: "x".repeat(20_000) }), ip: ip(32) });
  ok(r.status === 413, "an oversized body is a 413", String(r.status));
  r = await fetch(`${BASE}/api/t`, { method: "GET" });
  ok(r.status === 405, "GET is not allowed", String(r.status));
  await sleep(1200);
  const after = await prisma.pageView.count({ where: { lang: MARK } });
  ok(after === before + 1, "...and none of the refused requests stored anything (only the same-origin one did)", `${after - before} new rows`);

  // rate limit
  let limited = 0;
  await Promise.all(Array.from({ length: 140 }, async () => ((await post([], { ip: ip(99) })).status === 429 ? limited++ : 0)));
  ok(limited > 0, "a loop hammering the endpoint is slowed down (429)", `${limited} refused of 140`);

  /* ───────────── 2. the report, against known data ───────────── */
  console.log("\n— the report queries");
  const d = (s: string) => new Date(/^\d{4}-/.test(s) ? `${s}Z` : `2020-03-${s}Z`); // "03T10:00:00" is March; a full date is taken as written
  const pv = (id: string, visitor: string, at: string, path: string, kind: string, o: Record<string, unknown> = {}) => ({
    id: `zztest-${id}`, visitor: `zztest${visitor}`, at: d(at), path, kind, workId: null, referrer: null, refKind: "direct", country: "US", device: "desktop", browser: "Chrome", os: "Windows", lang: "en", gated: false, ...o,
  });
  await prisma.pageView.createMany({
    data: [
      // A: one visit of three pages, then (two hours later) a second visit of one page
      pv("a1", "A", "03T10:00:00", "/", "home", { referrer: "google.com", refKind: "search", country: "JP", device: "mobile", browser: "Safari", os: "iOS", lang: "ja", seconds: 30, gated: true }),
      pv("a2", "A", "03T10:05:00", "/g/1", "work", { workId: 1, country: "JP", device: "mobile", browser: "Safari", os: "iOS", lang: "ja", seconds: 60 }),
      pv("a3", "A", "03T10:10:00", "/read/1", "read", { workId: 1, country: "JP", device: "mobile", browser: "Safari", os: "iOS", lang: "ja" }),
      pv("a4", "A", "03T12:10:00", "/browse", "browse", { country: "JP", device: "mobile", browser: "Safari", os: "iOS", lang: "ja", seconds: 10 }),
      // B: a single page from reddit: a bounce
      pv("b1", "B", "04T08:00:00", "/g/2", "work", { workId: 2, referrer: "reddit.com", refKind: "social", seconds: 5 }),
      // C: two pages across the end of the day, arrived with campaign tags
      pv("c1", "C", "05T23:50:00", "/", "home", { utmSource: "newsletter", utmMedium: "email", utmCampaign: "launch", gated: true }),
      pv("c2", "C", "05T23:55:00", "/tag/big-breasts", "tag", { seconds: 20 }),
      // the period before: two visitors, three page views, two visits
      pv("p1", "P1", "2020-02-26T09:00:00", "/", "home"),
      pv("p2", "P1", "2020-02-26T09:03:00", "/g/1", "work", { workId: 1 }),
      pv("p3", "P2", "2020-02-27T09:00:00", "/", "home"),
    ],
  });
  const E = (id: string, visitor: string, at: string, name: string, o: Record<string, unknown> = {}) => ({ id: `zztest-${id}`, visitor: `zztest${visitor}`, at: d(at), name, ...o });
  await prisma.analyticsEvent.createMany({
    data: [
      E("e1", "A", "03T10:11:00", "read_start", { workId: 1, value: 1 }),
      E("e2", "A", "03T10:40:00", "read_end", { workId: 1, value: 20, total: 20 }),
      E("e3", "B", "04T08:01:00", "read_start", { workId: 2, value: 1 }),
      E("e4", "B", "04T08:10:00", "read_end", { workId: 2, value: 5, total: 30 }),
      E("e5", "A", "03T10:12:00", "favorite", { workId: 1, label: "add" }),
      E("e6", "B", "04T08:05:00", "favorite", { workId: 2, label: "add" }),
      E("e7", "B", "04T08:06:00", "favorite", { workId: 2, label: "remove" }),
      E("e8", "A", "03T10:30:00", "download", { workId: 1, value: 1 }),
      E("e9", "C", "05T23:56:00", "share", { workId: 1 }),
      E("s1", "A", "03T10:20:00", "search", { label: "big breasts", value: 120 }),
      E("s2", "C", "05T23:57:00", "search", { label: "big breasts", value: 120 }),
      E("s3", "B", "04T08:20:00", "search", { label: "xyzzy", value: 0 }),
      E("s4", "B", "04T08:21:00", "search", { label: "xyzzy", value: 0 }),
      E("s5", "A", "03T11:00:00", "search", { label: "nothing here", value: 0 }),
      E("g1", "A", "03T10:00:30", "age_gate", { label: "pass" }),
      E("n1", "B", "04T08:30:00", "not_found", { path: "/zz-missing" }),
      E("n2", "C", "05T23:58:00", "not_found", { path: "/zz-missing" }),
    ],
  });
  await prisma.webVital.createMany({
    data: [1000, 2000, 3000, 4000].map((v, i) => ({ at: d("03T10:00:00"), metric: "LCP", value: v, rating: v <= 2500 ? "good" : v <= 4000 ? "needs-improvement" : "poor", kind: "home", device: i < 2 ? "mobile" : "desktop" })),
  });
  const b: Bounds = { from: d("02T00:00:00"), to: d("09T00:00:00"), prevFrom: d("2020-02-24T00:00:00"), prevTo: d("02T00:00:00"), hourly: false, days: 7 };
  // object key order is not meaningful (SQL leaves ties in any order), so compare with keys sorted
const norm = (v: unknown): unknown => (Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, norm(x)])) : v);
const eq = (a: unknown, e: unknown, name: string) => ok(JSON.stringify(norm(a)) === JSON.stringify(norm(e)), name, `got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`);

  const o = await overview("7d", b);
  eq([o.totals.pageviews, o.totals.visitors, o.totals.sessions], [7, 3, 4], "page views, visitors and visits are counted exactly (a 2-hour gap starts a new visit)");
  eq([o.totals.bounceRate, o.totals.pagesPerSession], [50, 1.8], "bounce rate (single-page visits) and pages per visit");
  eq([o.totals.avgSeconds, o.totals.reportedPct], [25, 71.4], "average time counts only the page views that reported it, and says how many did");
  eq([o.previous.pageviews, o.previous.visitors, o.previous.sessions], [3, 2, 2], "the earlier period is measured the same way");
  eq(o.series.map((p) => [p.key, p.pageviews, p.visitors]).filter((p) => (p[1] as number) > 0), [["2020-03-03", 4, 1], ["2020-03-04", 1, 1], ["2020-03-05", 2, 1]], "the day-by-day series");
  eq(o.series.length, 8, "every day has a point, empty ones included"); // 02..09 inclusive
  const src = Object.fromEntries(o.sources.map((s) => [s.label, s.value]));
  eq(src, { direct: 2, search: 1, social: 1 }, "arrivals are split by where they came from");
  eq(Object.fromEntries(o.entryPages.map((s) => [s.label, s.value])), { "/": 2, "/browse": 1, "/g/2": 1 }, "entry pages are the first page of each visit");
  eq(o.referrers.map((r) => [r.label, r.value]).sort(), [["google.com", 1], ["reddit.com", 1]], "referring sites");
  eq(o.campaigns.map((c) => c.label), ["newsletter / email / launch"], "campaign tags are grouped");
  eq(Object.fromEntries(o.countries.map((c) => [c.label, c.value])), { JP: 1, US: 2 }, "countries count distinct visitors");
  eq(Object.fromEntries(o.devices.map((c) => [c.label, c.value])), { mobile: 1, desktop: 2 }, "devices");
  const home = o.topPages.find((p) => p.path === "/");
  eq([home?.views, home?.visitors], [2, 2], "top pages");
  eq(o.hours.filter((h) => h.views).map((h) => [h.hour, h.views]), [[8, 1], [10, 3], [12, 1], [23, 2]], "time of day");

  const c = await content("7d", b);
  eq([c.reading.chapterOpens, c.reading.readers, c.reading.finishedRate, c.reading.avgPagesRead, c.reading.chaptersPerReader], [2, 2, 50, 12.5, 1], "reading: chapters opened, readers, finished share, pages read");
  eq(c.funnel.map((f) => f.value), [3, 2, 1, 1], "the funnel: visitors, work page, reader, finished");
  eq(c.actions, { saves: 2, unsaves: 1, follows: 0, downloads: 1, shares: 1 }, "saves, follows, downloads and shares");
  const w1 = c.works.find((w) => w.publicId === 1);
  eq([w1?.views, w1?.reads, w1?.finished, w1?.saves], [1, 1, 1, 1], "per-work numbers join up");
  const w2 = c.works.find((w) => w.publicId === 2);
  eq([w2?.views, w2?.reads, w2?.finished, w2?.saves], [1, 1, 0, 0], "a save and an un-save cancel out");
  eq(c.tags.map((t) => t.label), ["/tag/big-breasts"], "most visited listings");

  const s = await search("7d", b);
  eq([s.searches, s.searchers, s.zeroRate], [5, 3, 60], "searches, people, share with no result");
  eq(s.top.slice(0, 2).map((t) => [t.query, t.count]), [["big breasts", 2], ["xyzzy", 2]], "top searches (ties in alphabetical order)");
  eq(s.zero.map((t) => [t.query, t.count]), [["xyzzy", 2], ["nothing here", 1]], "searches that found nothing");

  const h = await healthReport("7d", b);
  const lcpAll = h.vitals.all.find((v) => v.metric === "LCP");
  eq([lcpAll?.p75, lcpAll?.samples, lcpAll?.good, lcpAll?.needs, lcpAll?.poor], [3250, 4, 2, 2, 0], "75th percentile of real samples, with the rating mix");
  eq(h.vitals.mobile.find((v) => v.metric === "LCP")?.samples, 2, "phones are separated from computers");
  eq(h.vitals.all.find((v) => v.metric === "INP")?.p75, null, "no samples gives no number, not zero");
  eq([h.notFoundTotal, h.notFound[0]?.label, h.notFound[0]?.value], [2, "/zz-missing", 2], "pages not found");
  eq(h.gate, { shown: 2, passed: 1, rate: 50 }, "age gate: visitors who saw it and went on");
  ok(h.health.rows.views >= 10 && !!h.health.lastViewAt, "collector health reports what is stored");

  /* ───────────── 3. a real browser ───────────── */
  console.log("\n— a visitor's browser");
  // Playwright's browser says navigator.webdriver = true, which the tracker (rightly) treats as a robot; a real visitor's does not
  // the user agent is set for the whole browser: a per-page override is not applied to beacons sent while a page unloads, which would then
  // (correctly) be taken for a robot
  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled", `--user-agent=${CHROME}`] });
  const OVERRIDE = (dnt: boolean, wd: boolean) => `const o = (k, v) => Object.defineProperty(Navigator.prototype, k, { get: () => v, configurable: true }); ${dnt ? "o('doNotTrack', '1');" : ""} ${wd ? "o('webdriver', true);" : ""}`;
  const mk = async (opts: { dnt?: boolean; webdriver?: boolean } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "accept-language": MARK, ...(opts.dnt ? { dnt: "1" } : {}) } });
    await ctx.addCookies([{ name: AGE_COOKIE, value: "1", url: BASE }]);
    if (opts.dnt || opts.webdriver) await ctx.addInitScript({ content: OVERRIDE(!!opts.dnt, !!opts.webdriver) });
    return ctx;
  };
  // how many requests the page made to the collector (the bodies of beacons are not readable here; the database is checked instead)
  const watch = (page: import("playwright").Page) => {
    const seen: string[] = [];
    page.on("request", (q) => q.url().endsWith("/api/t") && q.method() === "POST" && seen.push(q.url()));
    return seen;
  };
  const ctx = await mk();
  const page = await ctx.newPage();
  const requests = watch(page);
  // land on a page that does not exist: a visit that starts on a 404 (its speed samples are then easy to tell from real ones)
  await page.goto(`${BASE}/zz-e2e-landing?utm_source=Test&utm_medium=e2e&utm_campaign=zz-e2e`, { waitUntil: "networkidle", referer: "https://www.google.com/search?q=private+words" });
  await page.waitForTimeout(2800);
  ok(requests.length > 0, "a visitor's browser reports to the collector");

  await page.getByRole("link", { name: "Browse everything" }).click();
  await page.waitForURL(/\/browse/);
  await page.waitForTimeout(600);
  const href = await page.locator('a[href^="/g/"]').first().getAttribute("href");
  await page.locator('a[href^="/g/"]').first().click();
  await page.waitForURL(/\/g\//);
  await page.waitForTimeout(1200);
  await page.locator('a[href^="/read/"]').first().click();
  await page.waitForURL(/\/read\//, { timeout: 20_000 });
  await page.waitForTimeout(2800);
  await page.mouse.click(640, 450);
  await page.waitForTimeout(800);
  // leaving the page reports the time spent and how far the visitor got
  await page.goto(`${BASE}/search?q=zz+test+query+nothing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.close();
  await ctx.close();

  const marked = await until(() => prisma.pageView.findFirst({ where: { utmCampaign: "zz-e2e" }, select: { visitor: true } }));
  const mine = await until(async () => {
    const v = await prisma.pageView.findMany({ where: { visitor: marked?.visitor ?? "none", id: { not: { startsWith: "zzt" } } }, orderBy: { at: "asc" } });
    return v.length >= 5 && v.some((x) => x.seconds != null) ? v : null;
  }, 12_000);
  ok(!!mine, "the browser's page views reached the database");
  if (mine) {
    const paths = mine.map((m) => m.path);
    const workPath = new URL(href!, BASE).pathname.replace(/^(\/g\/\d+)-.*$/, "$1");
    eq(paths.slice(0, 3), ["/zz-e2e-landing", "/browse", workPath], "stored: each client-side navigation is its own page view, in order, on the normalised path");
    ok(paths[3]?.startsWith("/read/") && paths[4] === "/search", "stored: then the reader and the search page", paths.join(" "));
    ok(mine[0]!.kind === "other" && mine[0]!.utmSource === "test" && mine[0]!.utmMedium === "e2e", "stored: the landing page, with its campaign lower-cased");
    ok(mine[0]!.referrer === "google.com" && mine[0]!.refKind === "search", "stored: arrived from a search engine (host only, never the search words)", `${mine[0]!.referrer} ${mine[0]!.refKind}`);
    ok(mine.slice(1).every((m) => m.utmSource === null && m.referrer === null && m.refKind === "direct"), "stored: the referrer and campaign belong to the first page of the visit only, even after moving between the site and the reader layouts");
    ok(["other", "browse", "work", "read", "search"].every((k) => mine.some((m) => m.kind === k)), "stored: page kinds are told apart", mine.map((m) => m.kind).join(","));
    ok(mine.every((m) => !m.path.includes("?") && !m.path.includes("zz+test")), "stored: no query strings, no search words in a page address");
    ok(mine.some((m) => m.seconds != null && m.seconds >= 1), "stored: time on page");
    ok(mine.every((m) => m.seconds == null || m.seconds <= 60), "stored: time on page is plausible (a few seconds in this test)", mine.map((m) => m.seconds).join(","));
    ok(mine.every((m) => m.visitor === mine[0]!.visitor), "stored: one browser is one visitor");
  }
  const evs = await prisma.analyticsEvent.findMany({ where: { visitor: marked?.visitor ?? "none" } });
  ok(["read_start", "read_end", "search", "not_found"].every((nme) => evs.some((e) => e.name === nme)), "stored: reading, search and 404 events", evs.map((e) => e.name).join(","));
  const se = evs.find((e) => e.name === "search");
  ok(se?.label === "zz test query nothing" && se?.value === 0, "stored: the search words and its (zero) result count", JSON.stringify(se));
  const rd = evs.find((e) => e.name === "read_end");
  ok(!!rd && rd.total! > 0 && rd.value! >= 1 && rd.value! <= rd.total! + 1, "stored: how far the visitor read, out of how many pages", JSON.stringify(rd));
  ok(evs.find((e) => e.name === "not_found")?.path === "/zz-e2e-landing", "stored: which address was not found");
  ok((await prisma.webVital.count({ where: { kind: "other", at: { gte: STARTED } } })) > 0, "stored: real-user speed samples for the landing page");

  // opt-outs, in a browser
  for (const [label, opts] of [["a visitor with Do Not Track", { dnt: true }], ["an automated browser (navigator.webdriver)", { webdriver: true }]] as const) {
    const c2 = await mk(opts);
    const p2 = await c2.newPage();
    const seen = watch(p2);
    const before2 = await prisma.pageView.count();
    await p2.goto(`${BASE}/?utm_campaign=zz-e2e`, { waitUntil: "networkidle" });
    await p2.waitForTimeout(2500);
    ok(seen.length === 0, `${label} sends nothing at all`, `${seen.length} requests`);
    ok((await prisma.pageView.count()) === before2, `${label} leaves nothing in the database`);
    await c2.close();
  }
  // the console is never measured
  const c3 = await mk();
  const p3 = await c3.newPage();
  const seen3 = watch(p3);
  await p3.goto(`${BASE}/console/login`).catch(() => {});
  await p3.waitForTimeout(1500);
  ok(seen3.length === 0, "nothing is sent from the console area");
  await c3.close();
  await browser.close();
} finally {
  await cleanup();
  const left = (await prisma.pageView.count({ where: { OR: [{ lang: MARK }, { visitor: { startsWith: "zztest" } }] } })) + (await prisma.webVital.count({ where: { OR: [{ value: MAGIC }, { at: { lt: new Date("2021-01-01") } }] } }));
  ok(left === 0, "the test data is gone again");
  await prisma.$disconnect();
}
console.log(fails ? `\n${fails} FAILED` : "\nall analytics checks passed");
process.exit(fails ? 1 : 0);
