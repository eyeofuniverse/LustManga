import { Http, UA } from "@/lib/http";

const API = "https://api.mangadex.org";
export const SITE = "mangadex";

type L10n = Record<string, string>;

export interface MdRel {
  id: string;
  type: string;
  attributes?: { name?: string; fileName?: string };
}
export interface MdManga {
  id: string;
  attributes: {
    title: L10n;
    altTitles: L10n[];
    description: L10n;
    originalLanguage: string;
    year: number | null;
    createdAt: string;
    status: string;
    contentRating: string;
    tags: { id: string; attributes: { name: L10n; group: string } }[];
  };
  relationships: MdRel[];
}
export interface MdChapter {
  id: string;
  attributes: {
    volume: string | null;
    chapter: string | null;
    title: string | null;
    translatedLanguage: string;
    pages: number;
    externalUrl: string | null;
    publishAt: string;
  };
}

// MangaDex limits: 5 req/s overall, 40 req/min on /at-home/server.
const api = new Http(260);
const atHomeApi = new Http(1700);

const INCLUDES = "includes[]=cover_art&includes[]=author&includes[]=artist";

/** The most-followed adult-rated manga. MangaDex caps offset+limit at 10000. */
export async function listPopular(offset: number, limit = 100): Promise<{ data: MdManga[]; total: number }> {
  const url =
    `${API}/manga?limit=${limit}&offset=${offset}&contentRating[]=pornographic&hasAvailableChapters=true` +
    `&order[followedCount]=desc&${INCLUDES}`;
  return api.json(url);
}

/**
 * The whole catalogue, oldest first, starting at `since` (UTC, "YYYY-MM-DDTHH:MM:SS"). MangaDex refuses
 * offsets past 10,000, so callers walk forward by moving `since` to the last item's createdAt (keyset
 * pagination) instead of increasing the offset.
 */
export async function listByCreated(since: string, offset: number, limit = 100): Promise<{ data: MdManga[]; total: number }> {
  const url =
    `${API}/manga?limit=${limit}&offset=${offset}&contentRating[]=pornographic&hasAvailableChapters=true` +
    `&order[createdAt]=asc&createdAtSince=${since}&${INCLUDES}`;
  return api.json(url);
}

export const toSince = (createdAt: string) => createdAt.slice(0, 19);

export async function getManga(id: string): Promise<MdManga | null> {
  const res = await api.request(`${API}/manga/${id}?${INCLUDES}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} manga ${id}`);
  return ((await res.json()) as { data: MdManga }).data;
}

export async function follows(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const q = ids.map((i) => `manga[]=${i}`).join("&");
  const r = await api.json<{ statistics: Record<string, { follows?: number }> }>(`${API}/statistics/manga?${q}`);
  return Object.fromEntries(Object.entries(r.statistics).map(([k, v]) => [k, v.follows ?? 0]));
}

/** All readable (non-external, non-empty) chapters, every language. */
export async function listChapters(mangaId: string): Promise<MdChapter[]> {
  const out: MdChapter[] = [];
  for (let offset = 0; ; offset += 500) {
    const url =
      `${API}/manga/${mangaId}/feed?limit=500&offset=${offset}&order[volume]=asc&order[chapter]=asc` +
      `&contentRating[]=pornographic&includeEmptyPages=0&includeFuturePublishAt=0&includeExternalUrl=0`;
    const r = await api.json<{ data: MdChapter[]; total: number }>(url);
    out.push(...r.data);
    if (offset + 500 >= r.total || offset + 500 >= 10000) break;
  }
  return out.filter((c) => c.attributes.pages > 0 && !c.attributes.externalUrl);
}

export interface PageRef {
  n: number;
  url: string;
}

export async function pageRefs(chapterId: string): Promise<PageRef[]> {
  const r = await atHomeApi.json<{ baseUrl: string; chapter: { hash: string; data: string[] } }>(
    `${API}/at-home/server/${chapterId}`,
  );
  return r.chapter.data.map((file, i) => ({ n: i + 1, url: `${r.baseUrl}/data/${r.chapter.hash}/${file}` }));
}

/** Download one page image. MangaDex@Home nodes expect success/failure reports (best effort). */
export async function downloadPage(url: string): Promise<Buffer> {
  const t0 = Date.now();
  let ok = false;
  let bytes = 0;
  let cached = false;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    bytes = buf.length;
    cached = (res.headers.get("x-cache") ?? "").startsWith("HIT");
    ok = true;
    return buf;
  } finally {
    if (new URL(url).host.endsWith("mangadex.network")) {
      fetch("https://api.mangadex.network/report", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": UA },
        body: JSON.stringify({ url, success: ok, bytes, duration: Date.now() - t0, cached }),
      }).catch(() => {});
    }
  }
}

export function coverUrl(m: MdManga): string | null {
  const c = m.relationships.find((r) => r.type === "cover_art");
  const f = c?.attributes?.fileName;
  return f ? `https://uploads.mangadex.org/covers/${m.id}/${f}.512.jpg` : null;
}

export const names = (m: MdManga, type: "author" | "artist") =>
  [...new Set(m.relationships.filter((r) => r.type === type && r.attributes?.name).map((r) => r.attributes!.name!))];

export const tagNames = (m: MdManga) => m.attributes.tags.map((t) => t.attributes.name.en).filter(Boolean);

export const first = (l: L10n | undefined) => (l ? l[Object.keys(l)[0]] : undefined);

/** Best title for a given language: that language's alt title, else English, else the primary title. */
export function titleFor(m: MdManga, lang: string): string {
  const a = m.attributes;
  const alt = a.altTitles.find((t) => t[lang])?.[lang];
  return (lang === "en" ? a.title.en : alt) ?? a.title.en ?? alt ?? first(a.title) ?? "Untitled";
}
export const descriptionFor = (m: MdManga, lang: string) => m.attributes.description[lang] ?? m.attributes.description.en ?? first(m.attributes.description) ?? null;

export interface MdStats {
  follows: number;
  /** average rating, 0-10 (null when nobody has rated it) */
  rating: number | null;
  votes: number;
}

/** Followers and ratings for up to 100 titles in one request. */
export async function stats(ids: string[]): Promise<Record<string, MdStats>> {
  if (!ids.length) return {};
  const q = ids.map((i) => `manga[]=${i}`).join("&");
  type Raw = { follows?: number; rating?: { average?: number | null; distribution?: Record<string, number> } };
  const r = await api.json<{ statistics: Record<string, Raw> }>(`${API}/statistics/manga?${q}`);
  return Object.fromEntries(
    Object.entries(r.statistics).map(([id, s]) => {
      const votes = Object.values(s.rating?.distribution ?? {}).reduce((n, v) => n + (Number(v) || 0), 0);
      return [id, { follows: s.follows ?? 0, rating: s.rating?.average ?? null, votes }];
    }),
  );
}

/**
 * Adult titles added to MangaDex since `since` ("YYYY-MM-DDTHH:MM:SS", UTC), most followed first: its own idea of
 * "popular new titles", which is the nearest thing it has to a trending chart.
 */
export async function listNewPopular(since: string, offset: number, limit = 100): Promise<{ data: { id: string }[]; total: number }> {
  return api.json(
    `${API}/manga?limit=${limit}&offset=${offset}&contentRating[]=pornographic&hasAvailableChapters=true&order[followedCount]=desc&createdAtSince=${since}`,
  );
}
