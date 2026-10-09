import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SCORE, bayesianRating, growthScore, momentum, popularityScore, rankScore, scaleCount } from "./signals";

test("raw counts land on the shared 0..50000 scale, logarithmically", () => {
  assert.equal(scaleCount(0, 1000), 0);
  assert.equal(scaleCount(1000, 1000), MAX_SCORE);
  assert.equal(scaleCount(10_000_000, 1000), MAX_SCORE); // capped
  assert.ok(scaleCount(100, 1000) > scaleCount(10, 1000));
  assert.equal(scaleCount(-5, 1000), 0);
});

test("a rank in a source's popular list becomes a score: the top stays high, the tail fades", () => {
  assert.equal(rankScore(0, 2000), MAX_SCORE);
  const [r10, r100, r1000] = [rankScore(10, 2000), rankScore(100, 2000), rankScore(1000, 2000)];
  assert.ok(r10 > 38_000 && r10 < 44_000, String(r10));
  assert.ok(r100 > 22_000 && r100 < 30_000, String(r100));
  assert.ok(r1000 > 4_000 && r1000 < 9_000, String(r1000));
  assert.ok(rankScore(1, 2000) > rankScore(2, 2000));
  assert.equal(rankScore(2000, 2000), 0); // past the end of the list
  assert.equal(rankScore(5, 0), 0);
  assert.equal(rankScore(-1, 100), 0);
});

test("growth is a score only when something was gained, and a day's gain is worth more than a month's", () => {
  assert.equal(growthScore(0, "week"), 0);
  assert.equal(growthScore(-40, "week"), 0);
  assert.ok(growthScore(50, "day") > growthScore(50, "month"));
  assert.equal(growthScore(100_000, "day"), MAX_SCORE);
});

test("a rating needs votes behind it before it counts for much", () => {
  assert.equal(bayesianRating(null, 100), null);
  assert.equal(bayesianRating(9, 0), null);
  const oneVote = bayesianRating(10, 1)!;
  const manyVotes = bayesianRating(8.8, 2000)!;
  assert.ok(oneVote < 7.3, String(oneVote)); // one perfect vote barely moves it off the typical 7
  assert.ok(manyVotes > 8.7, String(manyVotes));
  assert.ok(manyVotes > oneVote);
  assert.equal(Math.round(bayesianRating(7, 500)! * 10) / 10, 7);
});

test("popularity comes from the source's counts, nudged by its rating", () => {
  const refs = { views: 1_500_000, favorites: 250_000 };
  assert.equal(popularityScore({}, refs, 123), 123); // the source published nothing: keep the fallback
  const plain = popularityScore({ favorites: 40_000 }, refs);
  const loved = popularityScore({ favorites: 40_000, rating: 9.2, votes: 3000 }, refs);
  const disliked = popularityScore({ favorites: 40_000, rating: 4.5, votes: 3000 }, refs);
  assert.ok(loved > plain && plain > disliked, `${loved} ${plain} ${disliked}`);
  assert.ok(loved <= plain * 1.151 && disliked >= plain * 0.849);
  assert.ok(popularityScore({ views: 900_000 }, refs) > popularityScore({ views: 9_000 }, refs));
  assert.equal(popularityScore({ favorites: 9_999_999, rating: 10, votes: 99999 }, refs), MAX_SCORE); // never past the cap
});

test("a work no window mentions ranks by a quarter of its all-time popularity", () => {
  assert.equal(momentum(30_000, 50_000), 30_000); // in a source's weekly chart
  assert.equal(momentum(0, 40_000), 10_000); // not in any chart
  assert.ok(momentum(5_000, 0) > momentum(0, 8_000)); // a chart entry beats a merely old favourite
});

import { dayString, rankMoveScore, windowGain } from "./signals";

test("snapshot days are UTC calendar days", () => {
  assert.equal(dayString(Date.UTC(2026, 9, 9, 23, 59)), "2026-10-09");
  assert.equal(dayString(new Date("2026-10-10T00:00:01Z")), "2026-10-10");
});

test("growth over a window compares today with the snapshot at the start of that window", () => {
  const h = [{ day: "2026-10-01", value: 100 }, { day: "2026-10-03", value: 130 }, { day: "2026-10-08", value: 150 }, { day: "2026-10-09", value: 190 }];
  assert.equal(windowGain(h, "2026-10-09", 1, "2026-10-01"), 40); // since yesterday
  // the window starts on 10-02; the latest snapshot on or before that is 10-01 (100), so the gain is 190 - 100
  assert.equal(windowGain(h, "2026-10-09", 7, "2026-10-01"), 90);
});

test("a work missing from the history starts from zero, and a short history is scaled up to the window", () => {
  // history began 4 days ago; the work first appears today
  assert.equal(windowGain([{ day: "2026-10-09", value: 800 }], "2026-10-09", 1, "2026-10-05"), 800);
  // only 2 days of history for a 7-day window: the 2-day gain is scaled by 3.5
  const two = [{ day: "2026-10-07", value: 100 }, { day: "2026-10-09", value: 120 }];
  assert.equal(windowGain(two, "2026-10-09", 7, "2026-10-07"), 70);
  // scaling is capped at 4x
  const one = [{ day: "2026-10-08", value: 0 }, { day: "2026-10-09", value: 10 }];
  assert.equal(windowGain(one, "2026-10-09", 30, "2026-10-08"), 40);
});

test("no history to compare with, or no reading for today, gives no growth figure", () => {
  assert.equal(windowGain([{ day: "2026-10-09", value: 5 }], "2026-10-09", 7, "2026-10-09"), null); // first day of data
  assert.equal(windowGain([{ day: "2026-10-05", value: 5 }], "2026-10-09", 7, "2026-10-05"), null); // nothing for today
  assert.equal(windowGain([], "2026-10-09", 7, "2026-10-01"), null);
});

test("moving up a popularity list is momentum; sliding down is not", () => {
  assert.equal(rankMoveScore(0), 0);
  assert.equal(rankMoveScore(-3000), 0);
  assert.equal(rankMoveScore(4000), 8000);
  assert.equal(rankMoveScore(40_000), MAX_SCORE);
});

import { GROWTH_SCALE, statsToFields } from "./signals";

test("a source page's counters become stored fields scaled to that source", () => {
  const f = statsToFields("hentaifox", { favorites: 100, publishedAt: new Date("2026-10-08T00:00:00Z") });
  assert.equal(f.srcFavorites, 100);
  assert.equal(f.srcViews, undefined);
  assert.equal(f.sourceAt?.toISOString(), "2026-10-08T00:00:00.000Z");
  assert.ok(f.seedPopularity! > 20_000 && f.seedPopularity! < 26_000, String(f.seedPopularity));
  // the same 100 favourites mean far less on a source where 60,000 is a hit
  assert.ok(statsToFields("hentai2read", { favorites: 100 }).seedPopularity! < f.seedPopularity! + 3000);
  const h = statsToFields("hentai2read", { views: 8240, favorites: 31_547, rating: 10, votes: 15_014 });
  assert.equal(h.srcRating, 8.2); // Hentai2Read's scores count at 40%: 7 + 3 * 0.4
  assert.equal(h.srcVotes, 15_014);
  assert.ok(h.seedPopularity! > 30_000 && h.seedPopularity! < 45_000, String(h.seedPopularity));
});

test("a page that showed no counters sets no popularity, and an unknown source sets none either", () => {
  assert.deepEqual(statsToFields("hentaifox", {}), {});
  assert.equal(statsToFields("hentaifox", { favorites: 0 }).seedPopularity, undefined); // zero favourites says nothing yet
  assert.equal(statsToFields("somewhere-new", { favorites: 500 }).seedPopularity, undefined);
  assert.equal(statsToFields("somewhere-new", { favorites: 500 }).srcFavorites, 500);
});

test("growth is judged against the source: ten favourites a week is a lot on a small site", () => {
  assert.ok(growthScore(10, "week", GROWTH_SCALE.hentaifox) > growthScore(10, "week", GROWTH_SCALE.mangadex) * 1.5);
  assert.equal(growthScore(50_000, "week", GROWTH_SCALE.hentaifox), MAX_SCORE);
});

import { trustedRating, windowGainSince } from "./signals";

test("impossible ratings are dropped, and a source that rates everything 5/5 cannot top the table", () => {
  assert.equal(statsToFields("hentai2read", { rating: 182228, votes: 642 }).srcRating, undefined);
  assert.equal(statsToFields("hentai2read", { rating: 182228, votes: 642 }).srcVotes, undefined);
  assert.equal(statsToFields("mangadex", { rating: -1, votes: 5 }).srcRating, undefined);
  assert.equal(statsToFields("mangadex", { rating: 8.9, votes: 20_000 }).srcRating, 8.9);
  assert.ok(trustedRating("hentai2read", 10)! < trustedRating("mangadex", 8.9)!);
});

test("a work published inside the window grew from zero; an older one only counts what was measured", () => {
  const today = "2026-10-09";
  const fresh = [{ day: today, value: 40 }];
  // published 3 days ago with 40 favourites: 40 in 3 days, scaled to a week's rate like any short history (40 * 7/3)
  const rate = windowGainSince(fresh, today, 7, "2026-10-08", new Date("2026-10-06T10:00:00Z"))!;
  assert.ok(Math.abs(rate - (40 * 7) / 3) < 0.01, String(rate));
  // published today: compared with zero yesterday
  assert.equal(windowGainSince(fresh, today, 1, "2026-10-08", new Date("2026-10-09T01:00:00Z")), 40);
  // published years ago with 800 favourites and no snapshots yet: no growth figure at all (it did NOT gain 800 this week)
  assert.equal(windowGainSince([{ day: today, value: 800 }], today, 7, "2026-10-08", new Date("2023-01-01T00:00:00Z")), null);
  // ...and with a real snapshot from yesterday, only the real difference counts
  assert.equal(windowGainSince([{ day: "2026-10-08", value: 790 }, { day: today, value: 800 }], today, 1, "2026-10-08", new Date("2023-01-01T00:00:00Z")), 10);
  // no publish date: behaves like windowGain
  assert.equal(windowGainSince([{ day: "2026-10-08", value: 5 }, { day: today, value: 9 }], today, 1, "2026-10-08", null), 4);
});
