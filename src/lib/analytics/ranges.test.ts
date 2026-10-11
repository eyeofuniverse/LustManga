import { test } from "node:test";
import assert from "node:assert/strict";
import { bounds, change, clock, dayKey, fillSeries, p75, parseRange, pct } from "./ranges";
import { formatVital, rate } from "./vitals";
import { parseTab } from "./types";

const NOW = new Date("2026-10-11T14:30:00Z");

test("ranges: unknown input falls back to 7 days", () => {
  assert.equal(parseRange("30d"), "30d");
  assert.equal(parseRange("today"), "today");
  for (const bad of [undefined, "", "1y", "7D", null, 7, "7d; DROP TABLE"]) assert.equal(parseRange(bad), "7d");
  assert.equal(parseTab("search"), "search");
  assert.equal(parseTab("nope"), "overview");
});

test("bounds: 'last 7 days' is today so far and the six days before it", () => {
  const b = bounds("7d", NOW);
  assert.equal(b.from.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(b.to.toISOString(), NOW.toISOString());
  assert.equal(b.days, 7);
  assert.equal(b.hourly, false);
});

test("bounds: the comparison is the same length, shifted back and cut at the same moment", () => {
  const b = bounds("7d", NOW);
  assert.equal(b.prevFrom.toISOString(), "2026-09-28T00:00:00.000Z");
  assert.equal(b.prevTo.toISOString(), "2026-10-04T14:30:00.000Z");
  assert.equal(b.to.getTime() - b.from.getTime(), b.prevTo.getTime() - b.prevFrom.getTime(), "same length");
  const t = bounds("today", NOW);
  assert.equal(t.from.toISOString(), "2026-10-11T00:00:00.000Z");
  assert.equal(t.prevFrom.toISOString(), "2026-10-10T00:00:00.000Z");
  assert.equal(t.prevTo.toISOString(), "2026-10-10T14:30:00.000Z", "today so far is compared with yesterday so far, not a whole day");
  assert.equal(t.hourly, true);
});

test("bounds: month and year boundaries", () => {
  const b = bounds("30d", new Date("2026-03-02T01:00:00Z"));
  assert.equal(b.from.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(bounds("90d", new Date("2026-01-10T00:00:00Z")).from.toISOString(), "2025-10-13T00:00:00.000Z");
});

test("series: every day is present, quiet days are zero", () => {
  const b = bounds("7d", NOW);
  const s = fillSeries([{ key: "2026-10-07", pageviews: 5, visitors: 3 }, { key: "2026-10-11", pageviews: 9, visitors: 4 }], b);
  assert.equal(s.length, 7);
  assert.deepEqual(s.map((p) => p.key), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.deepEqual(s.map((p) => p.pageviews), [0, 0, 5, 0, 0, 0, 9]);
  assert.equal(s.at(-1)!.visitors, 4);
});

test("series: today is hourly, up to the current hour", () => {
  const b = bounds("today", NOW);
  const s = fillSeries([{ key: "2026-10-11 09", pageviews: 2, visitors: 2 }], b);
  assert.equal(s.length, 15); // 00:00 .. 14:00
  assert.equal(s[0]!.key, "2026-10-11 00");
  assert.equal(s[9]!.pageviews, 2);
  assert.equal(s.at(-1)!.key, "2026-10-11 14");
});

test("series: a row outside the range is ignored, not invented", () => {
  const s = fillSeries([{ key: "2020-01-01", pageviews: 99, visitors: 9 }], bounds("7d", NOW));
  assert.equal(s.reduce((n, p) => n + p.pageviews, 0), 0);
});

test("dayKey is the UTC date", () => {
  assert.equal(dayKey(new Date("2026-10-11T23:59:59Z")), "2026-10-11");
  assert.equal(dayKey(new Date("2026-10-12T00:00:00Z")), "2026-10-12");
});

test("change: percentages, and no number at all when there is nothing to compare with", () => {
  assert.equal(change(150, 100), 50);
  assert.equal(change(50, 100), -50);
  assert.equal(change(100, 100), 0);
  assert.equal(change(5, 0), null, "never 'infinity percent'");
  assert.equal(change(0, 0), null);
  assert.equal(change(NaN, 5), null);
  assert.equal(change(1, 3), -66.7);
});

test("pct and p75 and clock", () => {
  assert.equal(pct(1, 3), 33.3);
  assert.equal(pct(5, 0), 0);
  assert.equal(p75([]), null);
  assert.equal(p75([100]), 100);
  assert.equal(p75([1, 2, 3, 4]), 3);
  assert.equal(p75([4, 1, 3, 2, 10, 9, 8, 7]), 8);
  assert.equal(clock(null), "-");
  assert.equal(clock(42), "42s");
  assert.equal(clock(65), "1m 05s");
  assert.equal(clock(3725), "1h 02m");
});

test("web vitals: Google's thresholds, and CLS shown as its real value", () => {
  assert.equal(rate("LCP", 2500), "good");
  assert.equal(rate("LCP", 2501), "needs-improvement");
  assert.equal(rate("LCP", 4001), "poor");
  assert.equal(rate("INP", 200), "good");
  assert.equal(rate("CLS", 100), "good"); // 0.1
  assert.equal(rate("CLS", 251), "poor"); // 0.251
  assert.equal(rate("LCP", null), null);
  assert.equal(rate("WAT", 1), null);
  assert.equal(formatVital("CLS", 87), "0.09");
  assert.equal(formatVital("LCP", 1800), "1.8 s");
  assert.equal(formatVital("TTFB", 420), "420 ms");
  assert.equal(formatVital("LCP", null), "-");
});
