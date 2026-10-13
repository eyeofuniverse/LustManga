/**
 * Where the reader shows an ad between pages. Pure (no browser, no database), so the rules that decide how often a reader is
 * interrupted are tested.
 *
 *   - after every 15 pages, or every 30 in a long work (a work of 100 pages or more);
 *   - never before the first interval has been read, and never so close to the end that it would sit next to the end-of-chapter
 *     card (which has its own ad): at least MIN_TAIL pages must still follow it;
 *   - at most MAX_PER_CHAPTER in one chapter, however long it is.
 */
export const BIG_WORK_PAGES = 100;
export const EVERY_SMALL = 15;
export const EVERY_BIG = 30;
export const MIN_TAIL = 6;
export const MAX_PER_CHAPTER = 20;

/** the interval for a work, from the number of pages in the whole work (not the chapter being read) */
export const readerAdEvery = (workPages: number): number => (workPages >= BIG_WORK_PAGES ? EVERY_BIG : EVERY_SMALL);

/** The pages an ad follows, in order: `every`, 2 x `every`, ... while MIN_TAIL pages remain after it. */
export function readerAdPositions(total: number, every: number): number[] {
  if (!Number.isFinite(total) || !Number.isFinite(every) || every < 1) return [];
  const out: number[] = [];
  for (let p = Math.floor(every); p <= total - MIN_TAIL && out.length < MAX_PER_CHAPTER; p += Math.floor(every)) out.push(p);
  return out;
}

/**
 * A reader whose browser keeps showing nothing where an ad should be (a content blocker, or no ad for them) is not asked to look
 * at empty slides: after this many empty ones in a session the reader stops making room for ads at all.
 */
export const SESSION_EMPTY_LIMIT = 2;
