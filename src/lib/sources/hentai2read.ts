import { Http, UA } from "@/lib/http";
import { parseH2rStats, type SourceStats } from "@/lib/sources/stats";

export const SITE = "hentai2read";
const BASE = "https://hentai2read.com";

// The origin server is slow and intermittently answers 520 / a stub page, so keep the pace gentle.
const http = new Http(900);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RESERVED =
  /^(latest|hentai-list|hentai-search|tag-doujnshi|login|signup|register|random|popular|contact|tos|dmca|privacy|favorites|history|hentai-rss|api|assets|static)$/;

/**
 * Fetch a page. Retries 5xx, Cloudflare 520s and the short stub page the site sometimes returns
 * instead of real content. Returns null only for a genuine 404.
 */
async function html(path: string): Promise<string | null> {
  const url = path.startsWith("http") ? path : BASE + path;
  for (let i = 0; i < 6; i++) {
    const res = await http.request(url, {}, 3).catch(() => null);
    if (res) {
      if (res.status === 404) return null;
      const text = await res.text();
      if (res.ok && text.length > 3000 && !/Error code 5\d\d/.test(text)) return text;
    }
    await sleep(2000 * (i + 1));
  }
  throw new Error(`hentai2read unreachable: ${path}`);
}

const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

/** Work slugs on a listing page, in the order shown. */
export async function listSlugs(mode: "popular" | "recent", page: number): Promise<string[]> {
  const sort = mode === "popular" ? "most-popular" : "last-added";
  const body = await html(page <= 1 ? `/hentai-list/all/any/all/${sort}` : `/hentai-list/all/any/all/${sort}/${page}/`);
  if (!body) return [];
  const slugs = [...body.matchAll(/href="https:\/\/hentai2read\.com\/([\w-]+)\/"/g)].map((m) => m[1]).filter((s) => !RESERVED.test(s));
  return [...new Set(slugs)];
}

export interface H2RWork {
  slug: string;
  /** views, bookmarks and the rating shown on the page */
  stats: SourceStats;
  title: string;
  pages: number;
  views: number;
  language: string;
  artists: string[];
  parodies: string[];
  characters: string[];
  /** genre labels (the "Category" row) and content tags (the "Content" row) */
  genres: string[];
  content: string[];
  status: string | null;
  year: number | null;
  /** numeric chapter slugs in reading order */
  chapters: { slug: string; number: number }[];
}

export async function getWork(slug: string): Promise<H2RWork | null> {
  const page = await html(`/${slug}/`);
  if (!page) return null;
  const body = page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");

  // title: the "<title> Chapters" heading
  const heading = [...body.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => text(m[2])).find((t) => / Chapters$/.test(t));
  const title = heading?.replace(/ Chapters$/, "").trim() || text((body.match(/<title>([^<]*)/) ?? [])[1] ?? "").split(" Hentai by ")[0].replace(/\s*\([^)]*\)$/, "").trim();
  if (!title) return null;

  // metadata rows:  <li class="text-primary"><b>Label</b> <a class="tagButton">Value</a> ...</li>
  const rows: Record<string, string[]> = {};
  for (const m of body.matchAll(/<li class="text-primary"><b>\s*([^<]+?)\s*<\/b>([\s\S]*?)<\/li>/g)) {
    rows[m[1]] = [...m[2].matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map((a) => text(a[1])).filter((v) => v && v !== "-");
  }
  const num = (s?: string) => Number((s ?? "").replace(/[^\d]/g, "")) || 0;

  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const chapSlugs = [...new Set([...body.matchAll(new RegExp(`href="https://hentai2read\\.com/${esc}/([\\w.\\-]+)/"`, "g"))].map((m) => m[1]))];
  const chapters = chapSlugs
    .map((s) => ({ slug: s, number: Number(s) }))
    .filter((c) => Number.isFinite(c.number) && c.number > 0)
    .sort((a, b) => a.number - b.number);

  return {
    slug,
    stats: parseH2rStats(page),
    title,
    pages: num(rows["Page"]?.[0]),
    views: num(rows["View"]?.[0]),
    language: rows["Language"]?.[0] ?? "English",
    artists: [...new Set([...(rows["Artist"] ?? []), ...(rows["Author"] ?? [])])],
    parodies: (rows["Parody"] ?? []).filter((p) => p.toLowerCase() !== "original"),
    characters: rows["Character"] ?? [],
    genres: (rows["Category"] ?? []).filter((g) => g.toLowerCase() !== "adult"),
    content: rows["Content"] ?? [],
    status: rows["Status"]?.[0] ?? null,
    year: num(rows["Release Year"]?.[0]) || null,
    chapters,
  };
}

const IMG_HOSTS = ["img1", "img2", "img3"].map((h) => `https://${h}.hentaicdn.com/hentai`);

/** Image paths for one chapter, as full URLs on the primary image host. */
export async function getChapterImages(slug: string, chapter: string): Promise<string[]> {
  const body = await html(`/${slug}/${chapter}/`);
  const raw = body?.match(/'images'\s*:\s*(\[[^\]]*\])/)?.[1];
  if (!raw) throw new Error(`no image list on ${slug}/${chapter}`);
  const paths = JSON.parse(raw.replace(/'/g, '"')) as string[];
  return paths.map((p) => `${IMG_HOSTS[0]}${p}`);
}

/** Download one page image, falling over to the sibling image hosts if the first one fails. */
export async function downloadImage(url: string, referer = BASE + "/"): Promise<Buffer> {
  const path = url.replace(/^https:\/\/img\d\.hentaicdn\.com\/hentai/, "");
  let lastErr: unknown;
  for (let i = 0; i < IMG_HOSTS.length * 2; i++) {
    const host = IMG_HOSTS[i % IMG_HOSTS.length];
    try {
      const res = await fetch(`${host}${path}`, { headers: { "user-agent": UA, referer }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(600 * (i + 1));
  }
  throw lastErr instanceof Error ? lastErr : new Error("download failed");
}

/** Just the counters on a work's page, for the signals refresh. null if the work is gone. */
export async function getPageStats(slug: string): Promise<SourceStats | null> {
  const page = await html(`/${slug}/`);
  return page ? parseH2rStats(page) : null;
}
