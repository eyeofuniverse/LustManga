/**
 * How the numbers other sites publish about a work (views, followers, ratings, "popular this week" lists) become the
 * scores that order our lists. Pure functions, no database: the refresh job (src/lib/ingest/signals.ts) feeds them,
 * the query builder reads the results.
 *
 * Everything lands on one scale, 0..50000, so a work from any source can be compared with a work from any other.
 */
export const MAX_SCORE = 50_000;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A raw count on the 0..50000 scale, logarithmic so a few huge numbers do not flatten everything else. `ref` is "very popular". */
export const scaleCount = (raw: number, ref: number): number => clamp(Math.round((MAX_SCORE * Math.log1p(Math.max(0, raw))) / Math.log1p(ref)), 0, MAX_SCORE);

/**
 * Position in a source's own popularity list (0 = best) of `length` entries. The top stays close to the maximum and the
 * long tail decays: rank 0 -> 50000, rank 10 of 2000 -> about 41000, rank 100 -> 26000, rank 1000 -> 6500.
 */
export function rankScore(rank: number, length: number): number {
  if (length <= 0 || rank < 0 || rank >= length) return 0;
  return Math.round(MAX_SCORE * (1 - Math.pow(Math.log1p(rank) / Math.log1p(length), 1.5)));
}

/** How big a gain counts as "very hot" in each window, by followers/views gained (a day's gain is smaller than a month's). */
export const GAIN_REF = { day: 120, week: 700, month: 2500 } as const;
export type Window = keyof typeof GAIN_REF;

/**
 * A gain in followers, favourites or views over a window as a momentum score. Nothing gained, or lost, scores 0.
 * `scale` adapts the reference to the source: a hot work on a small site gains tens of favourites a week where one on
 * MangaDex gains hundreds of followers.
 */
export const growthScore = (gain: number, window: Window, scale = 1): number => (gain > 0 ? scaleCount(gain, GAIN_REF[window] * scale) : 0);

/** How many favourites a week counts as "very hot" relative to MangaDex's followers, per source. */
export const GROWTH_SCALE: Record<string, number> = { mangadex: 1, hentai2read: 0.4, hentaifox: 0.08, hentaiera: 0.08, asmhentai: 0.08, nhentaixxx: 0.08 };

/**
 * Average rating (0-10) pulled toward the typical rating when few people voted, so one perfect vote does not beat a
 * thousand good ones. null when there is no rating at all.
 */
export function bayesianRating(rating: number | null | undefined, votes: number, prior = 7, weight = 25): number | null {
  if (rating == null || !Number.isFinite(rating) || votes <= 0) return null;
  return (votes * clamp(rating, 0, 10) + weight * prior) / (votes + weight);
}

/** Per-source "very popular" references for the raw count that source publishes. */
export const POPULARITY_REFS = {
  mangadex: { favorites: 250_000 }, // followers
  hentai2read: { views: 60_000_000, favorites: 2_000_000 }, // views, and people who put it on a Read List
  hentaifox: { favorites: 20_000 },
  hentaiera: { favorites: 20_000 },
  asmhentai: { favorites: 20_000 },
  nhentaixxx: { favorites: 20_000 },
} as const;

export interface RawSignals {
  views?: number;
  favorites?: number;
  rating?: number | null;
  votes?: number;
}

/**
 * All-time popularity from what a source publishes: the larger of the view and follower scales, nudged a little by
 * rating (a well-liked work ranks up to 15% higher, a disliked one up to 15% lower). Falls back to `fallback` when the
 * source published no counts at all.
 */
export function popularityScore(s: RawSignals, refs: { views?: number; favorites?: number }, fallback = 0): number {
  const scales = [s.views && refs.views ? scaleCount(s.views, refs.views) : 0, s.favorites && refs.favorites ? scaleCount(s.favorites, refs.favorites) : 0];
  const base = Math.max(...scales);
  if (base === 0) return fallback;
  const bayes = bayesianRating(s.rating, s.votes ?? 0);
  const factor = bayes == null ? 1 : 0.85 + 0.3 * clamp((bayes - 5) / 5, 0, 1);
  return clamp(Math.round(base * factor), 0, MAX_SCORE);
}

/**
 * Works that no source window mentions still need a place in "Trending": they take a quarter of their all-time
 * popularity, so a work that is actually climbing a source's chart beats them, and among themselves they keep the
 * all-time order. The same divisor is used in the SQL.
 */
export const TREND_FALLBACK_DIVISOR = 4;
export const momentum = (trend: number, popularity: number): number => (trend > 0 ? trend : Math.round(popularity / TREND_FALLBACK_DIVISOR));

/* ───────────────────────── growth from daily snapshots ───────────────────────── */

export const WINDOW_DAYS: Record<Window, number> = { day: 1, week: 7, month: 30 };

/** "2026-10-09": the UTC calendar day of a timestamp. Snapshots are keyed by it. */
export const dayString = (t: Date | number): string => new Date(t).toISOString().slice(0, 10);
const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

export interface Snap {
  day: string;
  value: number;
}

/**
 * How much a number grew over the last `windowDays` days, from daily snapshots (any order).
 *
 * `historyStart` is the first day we took ANY snapshot for this source. A work missing from the history after that
 * day was not on the source's list yet, so it counts as starting from 0 (a new entrant is rising fast). When the
 * history is shorter than the window, the gain is scaled up to the window (at most 4x) rather than ignored, so
 * trending works from the first day or two of data. Returns null when there is no earlier snapshot to compare with.
 */
export function windowGain(history: Snap[], today: string, windowDays: number, historyStart: string): number | null {
  const now = history.find((h) => h.day === today);
  if (!now) return null;
  const todayN = dayNumber(today);
  const start = dayNumber(historyStart);
  if (start >= todayN) return null; // the first day of data: nothing to compare yet
  const target = todayN - windowDays;
  const earlier = history.filter((h) => dayNumber(h.day) < todayN).sort((a, b) => dayNumber(b.day) - dayNumber(a.day));

  let baseline: number;
  let spanDays: number;
  const atTarget = earlier.find((h) => dayNumber(h.day) <= target);
  if (atTarget) {
    baseline = atTarget.value;
    spanDays = todayN - dayNumber(atTarget.day);
  } else if (start <= target) {
    baseline = 0; // the history covers the whole window and this work was not in it
    spanDays = windowDays;
  } else if (earlier.length) {
    const oldest = earlier[earlier.length - 1];
    baseline = oldest.value;
    spanDays = todayN - dayNumber(oldest.day);
  } else {
    baseline = 0; // history exists, but the work appeared after it began
    spanDays = todayN - start;
  }
  const gain = now.value - baseline;
  if (spanDays >= windowDays) return gain;
  return gain * Math.min(4, windowDays / Math.max(1, spanDays));
}

/** Climbing a source's popularity list is momentum: 10,000 points up the 0..50000 scale is a very strong week. */
export const rankMoveScore = (pointsGained: number): number => (pointsGained > 0 ? clamp(Math.round(pointsGained * 2), 0, MAX_SCORE) : 0);

/* ───────────────────────── a source page's counters -> what we store ───────────────────────── */

export interface PageStats {
  favorites?: number;
  views?: number;
  rating?: number | null;
  votes?: number;
  publishedAt?: Date;
}

/** The columns on Work that a source page's counters fill in (fields the page did not show are left out). */
export interface WorkSignalFields {
  srcFavorites?: number;
  srcViews?: number;
  srcRating?: number;
  srcVotes?: number;
  sourceAt?: Date;
  /** all-time popularity from the counters; absent when the page showed none */
  seedPopularity?: number;
}

/**
 * How far to believe a source's ratings (1 = fully). Hentai2Read shows "5/5" on most works whatever the quality, so
 * its scores are pulled toward the typical 7 and cannot swamp sources whose ratings actually vary.
 */
export const RATING_TRUST: Record<string, number> = { hentai2read: 0.4 };

/** A source's rating if it is a real 0..10 number, softened by how far that source's ratings can be trusted. */
export function trustedRating(site: string, rating: number | null | undefined): number | undefined {
  if (rating == null || !Number.isFinite(rating) || rating < 0 || rating > 10) return undefined; // e.g. "score 91114/5"
  const trust = RATING_TRUST[site] ?? 1;
  return Math.round((7 + (rating - 7) * trust) * 100) / 100;
}

/** Turn what a work's own page on a source says into stored fields, using that source's references. */
export function statsToFields(site: string, st: PageStats): WorkSignalFields {
  const out: WorkSignalFields = {};
  if (st.favorites !== undefined) out.srcFavorites = st.favorites;
  if (st.views !== undefined) out.srcViews = st.views;
  const rating = trustedRating(site, st.rating);
  if (rating !== undefined) {
    out.srcRating = rating;
    if (st.votes !== undefined) out.srcVotes = st.votes;
  }
  if (st.publishedAt) out.sourceAt = st.publishedAt;
  const refs = (POPULARITY_REFS as Record<string, { views?: number; favorites?: number }>)[site];
  if (refs) {
    const seed = popularityScore({ views: st.views, favorites: st.favorites, rating, votes: st.votes }, refs, -1);
    if (seed >= 0) out.seedPopularity = seed;
  }
  return out;
}

/**
 * windowGain, plus one extra fact: when the work was published. A work published INSIDE the window started from zero
 * that day, so everything it has gathered since is growth (a brand-new work with 40 favourites is rising fast). A work
 * published before the window says nothing about the window, so only real snapshots count for it. A work published
 * today is compared with zero yesterday.
 */
export function windowGainSince(history: Snap[], today: string, windowDays: number, historyStart: string, publishedAt?: Date | null): number | null {
  const todayN = dayNumber(today);
  if (publishedAt) {
    const published = dayNumber(dayString(publishedAt));
    if (published > todayN - windowDays) {
      const from = Math.min(published, todayN - 1);
      const day = new Date(from * 86_400_000).toISOString().slice(0, 10);
      const withStart = history.some((h) => h.day === day) ? history : [...history, { day, value: 0 }];
      return windowGain(withStart, today, windowDays, day < historyStart ? day : historyStart);
    }
  }
  // an older work seen for the first time today did not gain its whole count this week: wait for a real earlier reading
  if (publishedAt && !history.some((h) => h.day < today)) return null;
  return windowGain(history, today, windowDays, historyStart);
}
