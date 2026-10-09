/** Display helpers shared by server and client components. */

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ko", label: "Korean" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ru", label: "Russian" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "th", label: "Thai" },
  { code: "vi", label: "Vietnamese" },
  { code: "id", label: "Indonesian" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "ar", label: "Arabic" },
];
const LANG = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.label]));
export const langLabel = (code: string) => LANG[code] ?? code.toUpperCase();

export const CATEGORIES: { value: string; label: string }[] = [
  { value: "DOUJINSHI", label: "Doujinshi" },
  { value: "MANGA", label: "Manga" },
  { value: "ARTIST_CG", label: "Artist CG" },
  { value: "GAME_CG", label: "Game CG" },
  { value: "WESTERN", label: "Western" },
  { value: "IMAGE_SET", label: "Image set" },
];
/** The clean page for a category (the same URL the footer and the sitemap use), not a /browse?cat= filter. */
export const categoryHref = (c: string) => (c === "OTHER" ? "/category/misc" : tagHref("category", c.toLowerCase().replace(/_/g, "-")));
export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? "Other";

/** 1234 -> 1.2K, 1500000 -> 1.5M */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function timeAgo(date: Date | string | number): string {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  const units: [number, string][] = [
    [31_536_000, "year"],
    [2_592_000, "month"],
    [604_800, "week"],
    [86_400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [secs, name] of units) {
    const n = Math.floor(s / secs);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export const isNew = (createdAt: Date | string, days = 3) => Date.now() - new Date(createdAt).getTime() < days * 86_400_000;

/** URL for a work: the numeric id is what routes; the slug is only for readability and SEO. */
export const workHref = (w: { publicId: number; slug: string }) => `/g/${w.publicId}-${encodeURIComponent(w.slug || "work")}`;
export const readHref = (publicId: number, chapter = 1, page?: number) => `/read/${publicId}/${chapter}${page ? `?p=${page}` : ""}`;

export const TAG_TYPES = ["tag", "artist", "group", "parody", "character", "language", "category"] as const;
export type TagTypeSlug = (typeof TAG_TYPES)[number];
export const TAG_TYPE_LABEL: Record<TagTypeSlug, string> = {
  tag: "Tags",
  artist: "Artists",
  group: "Groups",
  parody: "Parodies",
  character: "Characters",
  language: "Languages",
  category: "Categories",
};
export const tagHref = (type: string, slug: string) => `/${type.toLowerCase()}/${encodeURIComponent(slug)}`;
