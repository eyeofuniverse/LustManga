import { timeAgo } from "@/lib/format";

/**
 * The sentences the home, Browse and series pages say about the library and about a work. Pure (no database, no React), so
 * what the pages claim is tested. Everything here comes from numbers and tags we hold: nothing describes a plot, because we
 * do not know one, and nothing says "daily" or "hourly" unless the newest upload backs it up.
 */

const n = (x: number) => x.toLocaleString("en-US");

export interface LibraryFacts {
  works: number;
  chapters: number;
  pages: number;
  languages: number;
  artists: number;
  circles: number;
  parodies: number;
  tags: number;
  /** when the newest work was added (an ISO string when it came out of the cache) */
  latest: Date | string | null;
}

/** What the library holds, in one paragraph. */
export function libraryParagraph(s: LibraryFacts, now: Date = new Date()): string {
  if (!s.works) return "LustPages is a free library of hentai manga and doujinshi.";
  const parts = [
    `LustPages is a free library of ${n(s.works)} hentai manga, doujinshi and other adult comics`,
    s.chapters ? `${n(s.chapters)} chapters` : "",
    s.pages ? `${n(s.pages)} pages` : "",
  ].filter(Boolean);
  const head = parts.length > 1 ? `${parts[0]}: ${parts.slice(1).join(" and ")}` : parts.join(", ");
  const langs = s.languages > 1 ? `, in ${s.languages} languages` : "";
  const who = s.artists > 0 ? `, by ${n(s.artists)} artists${s.circles > 0 ? ` and ${n(s.circles)} circles` : ""}` : "";
  const fresh = s.latest && now.getTime() - new Date(s.latest).getTime() < 14 * 86_400_000 ? ` The newest work was added ${timeAgo(s.latest, now.getTime())}.` : "";
  return `${head}${langs}${who}. Everything can be read online for free, with no account.${fresh}`;
}

/** Whole minutes to read a work at a relaxed pace of about 20 seconds a page (never less than 1). */
export const readingMinutes = (pages: number): number => Math.max(1, Math.round((pages * 20) / 60));

/** "about 19 minutes", "about 1 minute", "about 2 hours", "about 1 hour 20 minutes" */
export function readingTime(pages: number): string {
  const m = readingMinutes(pages);
  if (m < 60) return `about ${m} ${m === 1 ? "minute" : "minutes"}`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `about ${h} ${h === 1 ? "hour" : "hours"}${r >= 10 ? ` ${r} minutes` : ""}`;
}

/** "October 8, 2026" (in UTC, so a page looks the same wherever the server runs) */
export const longDate = (d: Date | string): string => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/** "1 chapter" / "21 chapters" */
export const plural = (count: number, one: string, many = `${one}s`): string => `${n(count)} ${count === 1 ? one : many}`;

/** "a, b and c" */
export const joinList = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export interface BrowseText {
  total: number;
  /** the order's name ("Popular") */
  sortLabel: string;
  languages: string[];
  categories: string[];
}

/** One line under the Browse heading that says what this list is: its size, its filters and its order. */
export function browseLead(b: BrowseText): string {
  const what = b.categories.length ? joinList(b.categories.map((c) => c.toLowerCase())) : "hentai manga, doujinshi and more";
  const lang = b.languages.length ? ` in ${joinList(b.languages)}` : " in every language";
  const size = b.total ? `${n(b.total)} works` : "No works";
  return `${size} of ${what}${lang}, ordered by ${b.sortLabel.toLowerCase()}.`;
}
