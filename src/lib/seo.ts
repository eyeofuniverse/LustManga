import type { Metadata } from "next";
import { IS_PRODUCTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { categoryLabel, langLabel, workHref } from "@/lib/format";
import { MAX_PAGE } from "@/lib/filters";
import { flatParams, intParam } from "@/lib/url";

/**
 * One place for everything search engines and social networks read: titles, descriptions, canonical rules,
 * robots decisions and structured data. Pure functions, so every rule here has a unit test.
 */
export const SITE = SITE_URL;
export const abs = (path: string) => (path.startsWith("http") ? path : `${SITE}${path.startsWith("/") ? "" : "/"}${path}`);

/* ───────────────────────── text helpers ───────────────────────── */

/** Collapse whitespace; cut at a word boundary with an ellipsis. */
export function clip(text: string | null | undefined, max: number): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const word = cut.replace(/\s+\S*$/, "");
  return `${(word.length >= max * 0.35 ? word : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** First sentence or two of a blurb, capped. */
export function excerpt(text: string | null | undefined, max = 155): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : clip(clean, max);
}

/**
 * Tag names are stored lower-case ("big breasts"). Capitalise them for titles, but leave anything that already
 * has capitals or is not Latin script alone ("NTR", "ゼンゼロ", "Fate/Grand Order").
 */
export function titleCase(name: string): string {
  if (/[A-Z]/.test(name) || /[^\u0000-ɏ]/.test(name)) return name;
  return name.replace(/(^|[\s(\-/])([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());
}

/** "Foo" on page 1, "Foo - Page 3" after, so paginated pages never share a title. */
export const withPage = (base: string, page: number) => (page > 1 ? `${base} - Page ${page}` : base);

/**
 * Cut a title to fit without leaving half a word: back to the last natural break (a space, dash, colon, comma, bracket
 * or CJK punctuation), with any bracket that would be left open removed. Only a run with no break at all (an unbroken
 * CJK title) is cut mid-run, and that one gets an ellipsis so the cut is honest.
 */
export function clipTitle(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  // a dash, colon, bracket or punctuation is a better place to stop than a plain space ("... Doukoukai - At")
  const strong = (i: number) => "([（【~～:：–—|".includes(s[i]) || (s[i] === "-" && s[i - 1] === " " && s[i + 1] === " ") || "、，,。！？!?)）]】".includes(s[i - 1] ?? "");
  const floor = Math.floor(max * 0.5);
  let at = -1;
  for (const accept of [strong, (i: number) => /\s/.test(s[i])]) {
    for (let i = Math.min(max, s.length - 1); i >= floor && at < 0; i--) if (accept(i)) at = i;
    if (at > 0) break;
  }
  if (at <= 0) return `${s.slice(0, max - 1).replace(/[\s,;:.\-–—]+$/, "")}…`;
  let out = s.slice(0, at);
  for (const [open, close] of [["(", ")"], ["（", "）"], ["[", "]"], ["【", "】"]] as const) {
    while (out.split(open).length > out.split(close).length) out = out.slice(0, out.lastIndexOf(open));
  }
  return out.replace(/[\s,;:：、，\-–—|~～]+$/u, "") || s.slice(0, max - 1) + "…";
}

/** What the category holds, in the words people search for: "Hentai Doujinshi", "Hentai Manga", "Western Hentai Comic". */
export function hentaiKind(category: string): string {
  switch (category) {
    case "DOUJINSHI":
      return "Hentai Doujinshi";
    case "ARTIST_CG":
      return "Hentai Artist CG";
    case "GAME_CG":
      return "Hentai Game CG";
    case "IMAGE_SET":
      return "Hentai Image Set";
    case "WESTERN":
      return "Western Hentai Comic";
    default:
      return "Hentai Manga";
  }
}

/* ───────────────────────── titles and descriptions ───────────────────────── */

/** A whole title (including the site name the template adds) stays near what a results page shows. */
const TITLE_BUDGET = 90;

export interface WorkForSeo {
  publicId: number;
  slug: string;
  title: string;
  titleOriginal?: string | null;
  description?: string | null;
  language: string;
  category: string;
  pageCount: number;
  coverKey?: string | null;
  createdAt?: Date | string;
  tags?: { type: string; name: string }[];
}

const namesOf = (w: WorkForSeo, type: string, n: number) =>
  (w.tags ?? []).filter((t) => t.type === type).slice(0, n).map((t) => titleCase(t.name));

/**
 * "Title - Read Hentai Doujinshi Online", plus "(Spanish)" for a translation: the work's own name comes first, English
 * is the default so it is not repeated on every page, and a translation stays distinct from the original. A very short
 * title ("Fanbox") gets its artist so it does not share a title with every other short one.
 */
export function workTitle(w: WorkForSeo): string {
  const lang = w.language === "en" ? "" : ` (${langLabel(w.language)})`;
  const tail = `${lang} - Read ${hentaiKind(w.category)} Online`;
  const room = TITLE_BUDGET - ` | ${SITE_NAME}`.length - tail.length;
  const artist = namesOf(w, "ARTIST", 1)[0];
  const base = w.title.length < 14 && artist && !w.title.toLowerCase().includes(artist.toLowerCase()) ? `${w.title} by ${artist}` : w.title;
  return `${clipTitle(base, Math.max(36, room))}${tail}`;
}

/**
 * What it is (language, kind, artist, parody, length), then the synopsis when there is one, then who is in it and its
 * tags, as many as fit. Ends cleanly inside 160 characters instead of being cut mid-word, and no boilerplate sentence
 * that every page shares.
 */
export function workDescription(w: WorkForSeo, max = 160): string {
  const lang = langLabel(w.language);
  const kind = hentaiKind(w.category).toLowerCase();
  const artists = namesOf(w, "ARTIST", 2);
  const parody = namesOf(w, "PARODY", 1).filter((p) => p.toLowerCase() !== "original");
  const characters = namesOf(w, "CHARACTER", 3);
  let out = clip(
    `Read ${w.title} online: ${/^[aeiou]/i.test(lang) ? "an" : "a"} ${lang} ${kind}${artists.length ? ` by ${artists.join(" & ")}` : ""}${parody.length ? ` (${parody[0]})` : ""}, ${w.pageCount} pages.`,
    max,
  );
  const fits = (extra: string) => (out + " " + extra).length <= max;
  const room = max - out.length - 1;
  const about = room >= 45 ? excerpt(w.description, room) : "";
  if (about) out += " " + about;
  if (characters.length && fits(`Featuring ${characters.join(", ")}.`)) out += ` Featuring ${characters.join(", ")}.`;
  const tags = namesOf(w, "TAG", 6);
  for (let n = tags.length; n > 0; n--) {
    const t = `Tags: ${tags.slice(0, n).join(", ")}.`;
    if (fits(t)) {
      out += " " + t;
      break;
    }
  }
  return out;
}

/** Title and description for a tag, artist, circle, parody, character, language or category page. */
export function tagSeo(type: string, rawName: string, count: number): { title: string; description: string; h1: string } {
  const name = titleCase(rawName);
  const n = count.toLocaleString("en-US");
  const works = `${n} ${count === 1 ? "work" : "works"}`;
  const end = `New uploads daily on ${SITE_NAME}.`;
  switch (type) {
    case "artist":
      return { h1: name, title: `${name} Hentai Manga & Doujinshi by ${name}`, description: clip(`Read ${works} by ${name}: hentai manga and doujinshi in every language, free online. ${end}`, 160) };
    case "group":
      return { h1: name, title: `${name} (Circle) - Hentai Doujinshi & Manga`, description: clip(`Read all ${works} from the circle ${name}: hentai doujinshi and manga in every language, free online. ${end}`, 160) };
    case "parody":
      return { h1: name, title: `${name} Hentai Doujinshi & Manga - Parody`, description: clip(`Read ${works} parodying ${name}: hentai doujinshi and manga in every language, free online. ${end}`, 160) };
    case "character":
      return { h1: name, title: `${name} Hentai Doujinshi & Manga - Character`, description: clip(`Read ${works} featuring ${name}: hentai doujinshi and manga in every language, free online. ${end}`, 160) };
    case "language":
      return { h1: name, title: `${name} Hentai Manga & Doujinshi - Read Online`, description: clip(`Read ${works} translated into ${name}: hentai manga and doujinshi, free online. ${end}`, 160) };
    case "category":
      return { h1: name, title: `${name} Hentai - Read Online Free`, description: clip(`Browse ${works} of ${name} hentai, free to read online in every language. ${end}`, 160) };
    default:
      return { h1: name, title: `${name} Hentai Manga & Doujinshi - Read Online`, description: clip(`Read ${works} tagged ${name}: hentai manga and doujinshi in every language, free online. ${end}`, 160) };
  }
}

/* ───────────────────────── indexing rules ───────────────────────── */

export interface ListingInput {
  /** the page's own path without a query, e.g. /tag/big-breasts */
  base: string;
  page: number;
  /** true when the URL carries any filter, sort or search that creates a near-duplicate of the base list */
  filtered: boolean;
  /** works (or entries) in the list; thin lists stay out of the index */
  count: number;
  /** a list with fewer than this is not worth indexing: it duplicates the work pages it links to */
  minCount?: number;
  /** deeper pages than this are crawlable but not indexed */
  maxIndexedPage?: number;
}

/**
 * Canonical and robots for a list page:
 *  - page 1 of the plain list indexes and is canonical to itself;
 *  - page 2..N is canonical to itself (not to page 1), indexed up to a point;
 *  - any sorted / filtered / searched variant is noindex and points back at the plain list;
 *  - thin lists are noindex. Links are always followed so crawlers still reach the works.
 */
export function listingMeta(i: ListingInput): Pick<Metadata, "alternates" | "robots"> {
  const { base, page, filtered, count, minCount = 1, maxIndexedPage = 5 } = i;
  const index = IS_PRODUCTION && !filtered && count >= minCount && page <= maxIndexedPage;
  const canonical = !filtered && page > 1 ? `${base}?page=${page}` : base;
  return { alternates: { canonical }, robots: { index, follow: true, googleBot: { index, follow: true, "max-image-preview": "large", "max-snippet": -1 } } };
}

/** The query keys that make a list a filtered variant (page alone does not). */
export const FILTER_KEYS = ["sort", "lang", "cat", "q", "letter"] as const;
export const isFiltered = (sp: Record<string, string | undefined>) => FILTER_KEYS.some((k) => !!sp[k]);

/** An entry (artist, circle, parody...) is indexable once it lists at least two works. */
export const MIN_INDEXABLE_ENTRIES = 2;

/* ───────────────────────── social cards ───────────────────────── */

/**
 * openGraph + twitter for one page, always complete. Next.js does not merge these objects down the layout tree: a
 * page that sets its own openGraph replaces the root one entirely, so every page builds both through here.
 */
export function socialMeta(opts: {
  title: string;
  description: string;
  /** the page's own path; leave out for site-wide defaults, where one fixed og:url would be wrong */
  path?: string;
  type?: "website" | "article" | "book";
  /** a path or URL; pass false when the route has its own opengraph-image file */
  image?: string | false;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const { title, description, path, type = "website", image = "/opengraph-image" } = opts;
  return {
    openGraph: {
      title,
      description,
      ...(path ? { url: path } : {}),
      siteName: SITE_NAME,
      locale: "en_US",
      type,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: { card: "summary_large_image", title, description, ...(image ? { images: [image] } : {}) },
  };
}

/* ───────────────────────── structured data ───────────────────────── */

export function breadcrumbLd(crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })),
  };
}

export const organizationLd = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE,
  logo: abs("/icon.png"),
});

/** WebSite + SearchAction: lets search engines offer a search box for the site. */
export const websiteLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE,
  inLanguage: "en",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${SITE}/search?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
});

/** A list page as an ItemList of its works, in the order shown. */
export function itemListLd(items: { publicId: number; slug: string; title: string }[], offset = 0) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((w, i) => ({ "@type": "ListItem", position: offset + i + 1, url: abs(workHref(w)), name: w.title })),
  };
}

export interface VariantForSeo {
  publicId: number;
  slug: string;
  language: string;
}

/** The work as a Book or ComicSeries, with who made it, what it is about, and how long it is. */
export function workLd(w: WorkForSeo, o: { kind: string; cover: string | null; variants?: VariantForSeo[]; chapters?: number }) {
  const artists = namesOf(w, "ARTIST", 5);
  const genres = (w.tags ?? []).filter((t) => t.type === "TAG").slice(0, 12).map((t) => titleCase(t.name));
  const parody = namesOf(w, "PARODY", 3);
  const characters = namesOf(w, "CHARACTER", 6);
  return {
    "@context": "https://schema.org",
    "@type": o.kind === "SERIES" ? "ComicSeries" : "Book",
    "@id": abs(workHref(w)),
    name: w.title,
    alternateName: w.titleOriginal && w.titleOriginal !== w.title ? w.titleOriginal : undefined,
    url: abs(workHref(w)),
    description: w.description ? excerpt(w.description, 300) : workDescription(w),
    inLanguage: w.language,
    image: o.cover ?? undefined,
    thumbnailUrl: o.cover ?? undefined,
    bookFormat: "https://schema.org/GraphicNovel",
    numberOfPages: o.kind === "SERIES" ? undefined : w.pageCount,
    hasPart: o.kind === "SERIES" && o.chapters ? { "@type": "CreativeWorkSeason", numberOfEpisodes: o.chapters } : undefined,
    dateCreated: w.createdAt ? new Date(w.createdAt).toISOString() : undefined,
    genre: genres.length ? genres : undefined,
    keywords: [...genres, ...parody, ...characters].join(", ") || undefined,
    author: artists.length ? artists.map((name) => ({ "@type": "Person", name })) : undefined,
    about: parody.length ? parody.map((name) => ({ "@type": "Thing", name })) : undefined,
    workTranslation: o.variants?.length ? o.variants.map((v) => ({ "@type": "Book", inLanguage: v.language, url: abs(workHref(v)) })) : undefined,
    isAccessibleForFree: true,
    isFamilyFriendly: false,
    contentRating: "adult",
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE },
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
  };
}

/** Serialise for a <script type="application/ld+json">: "<" is escaped so a title can never close the tag. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/* ───────────────────────── hreflang ───────────────────────── */

/**
 * Translations of one work reference each other, so a Spanish reader is sent to the Spanish copy.
 * Each language appears once (the first listed wins), and the page's own language is included.
 */
export function hreflangFor(self: VariantForSeo, variants: VariantForSeo[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of [self, ...variants]) if (!out[v.language]) out[v.language] = workHref(v);
  return Object.keys(out).length > 1 ? out : {};
}

/* ───────────────────────── page-level metadata builders ───────────────────────── */

/** A plain page (help, legal): its own title, description, canonical and share card. */
export function staticMeta(o: { title: string; description: string; path: string; index?: boolean }): Metadata {
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: o.path },
    ...(o.index === false ? { robots: { index: false, follow: true } } : {}),
    ...socialMeta({ title: o.title, description: o.description, path: o.path }),
  };
}

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Metadata for a list page that has pages and filters (browse, tag, the A-Z directories): a unique title per
 * page number, a self-canonical per page, and noindex for sorted / filtered / searched variants.
 */
export async function listingMetadata(o: {
  title: string;
  description: string;
  base: string;
  searchParams: Promise<RawParams>;
  count?: number;
  minCount?: number;
  type?: "website" | "article" | "book";
}): Promise<Metadata> {
  const sp = flatParams(await o.searchParams);
  const page = intParam(sp.page, 1, 1, MAX_PAGE);
  const meta = listingMeta({ base: o.base, page, filtered: isFiltered(sp), count: o.count ?? 1, minCount: o.minCount });
  const title = withPage(o.title, page);
  const description = page > 1 ? clip(`${o.description} Page ${page}.`, 160) : o.description;
  return { title, description, ...meta, ...socialMeta({ title, description, path: meta.alternates?.canonical as string, type: o.type }) };
}

/* ───────────────────────── home page ───────────────────────── */

export const HOME_TITLE = `${SITE_NAME} - Read Hentai Manga & Doujinshi Online Free`;
export const HOME_DESCRIPTION =
  "Read hentai manga and doujinshi online free in English, Japanese, Chinese and more. A fast book-style reader and new uploads every day. Adults only (18+).";
