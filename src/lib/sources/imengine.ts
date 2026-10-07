import { Http, UA } from "@/lib/http";

/**
 * One adapter for the family of nhentai-style sites that share an engine: hentaifox, hentaiera and
 * nhentai.xxx. They differ in URL layout and markup, but every gallery page carries the same hidden
 * loader fields, a per-page type table (g_th), and tag links of the form /tag/x/, /artist/x/ ...
 */
export interface SiteCfg {
  name: string;
  base: string;
  /** path prefix of a gallery page, e.g. "/gallery/" or "/g/" */
  galleryPath: string;
  /** listing URL; return null when the site has no such listing */
  listUrl: (mode: "popular" | "recent", lang: string | null, page: number) => string | null;
}

const withPage = (u: string, style: "path" | "query", page: number) =>
  page <= 1 ? u : style === "path" ? `${u.replace(/\/$/, "")}/pag/${page}/` : `${u}${u.includes("?") ? "&" : "?"}page=${page}`;

export const SITES: Record<string, SiteCfg> = {
  hentaifox: {
    name: "hentaifox",
    base: "https://hentaifox.com",
    galleryPath: "/gallery/",
    listUrl: (mode, lang, page) => (mode === "popular" ? null : withPage(lang ? `/language/${lang}/` : "/", "path", page)),
  },
  hentaiera: {
    name: "hentaiera",
    base: "https://hentaiera.com",
    galleryPath: "/gallery/",
    listUrl: (mode, lang, page) => (mode === "popular" ? null : withPage(lang ? `/language/${lang}/` : "/", "query", page)),
  },
  nhentaixxx: {
    name: "nhentaixxx",
    base: "https://nhentai.xxx",
    galleryPath: "/g/",
    listUrl: (mode, lang, page) =>
      withPage(lang ? `/language/${lang}/${mode === "popular" ? "popular/" : ""}` : mode === "popular" ? "/popular/" : "/", "query", page),
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const http = new Map<string, Http>();
const client = (cfg: SiteCfg) => {
  if (!http.has(cfg.name)) http.set(cfg.name, new Http(700));
  return http.get(cfg.name)!;
};

/** Fetch a page, retrying 5xx / stub pages. Returns null for a real 404. */
async function html(cfg: SiteCfg, path: string): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const res = await client(cfg).request(cfg.base + path, {}, 3).catch(() => null);
    if (res) {
      if (res.status === 404) return null;
      const t = await res.text();
      if (res.ok && t.length > 2000) return t;
    }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`${cfg.name} unreachable: ${path}`);
}

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

/** Gallery ids on a listing page, in the order shown. */
export async function listIds(cfg: SiteCfg, mode: "popular" | "recent", lang: string | null, page: number): Promise<string[] | null> {
  const url = cfg.listUrl(mode, lang, page);
  if (!url) return null; // this site has no such listing
  const body = await html(cfg, url);
  if (!body) return [];
  const re = new RegExp(`href="${cfg.galleryPath.replace(/\//g, "\\/")}(\\d+)\\/"`, "g");
  return [...new Set([...body.matchAll(re)].map((m) => m[1]))];
}

export interface IMGallery {
  id: string;
  title: string;
  pages: number;
  tags: string[];
  artists: string[];
  groups: string[];
  parodies: string[];
  characters: string[];
  languages: string[];
  categories: string[];
  /** full-size image URL per page, in order */
  images: string[];
}

const EXT: Record<string, string> = { j: "jpg", p: "png", g: "gif", w: "webp", b: "bmp" };

/** Pull the first balanced {...} object at or after index `from`. */
function objectAt(src: string, from: number): string | null {
  const start = src.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

export async function getGallery(cfg: SiteCfg, id: string): Promise<IMGallery | null> {
  const page = await html(cfg, `${cfg.galleryPath}${id}/`);
  if (!page) return null;

  const hidden = Object.fromEntries([...page.matchAll(/<input[^>]*id="(load_\w+|gallery_\w+)"[^>]*value="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const pages = Number(hidden.load_pages) || 0;
  const title = decode((page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) ?? [])[1] ?? "");
  if (!title || !pages) return null;

  // tag links are the same shape on every site: /tag/x/, /artist/x/, /parody/x/ ...
  const body = page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  const from = body.search(/<h1/);
  const rest = body.slice(from);
  const cut = rest.search(/More Like This|Related|class="[^"]*(?:related|comments)[^"]*"|id="comments"/i);
  const region = cut > 0 ? rest.slice(0, cut) : rest.slice(0, 12000);
  const by: Record<string, Set<string>> = {};
  for (const m of region.matchAll(/<a[^>]*href=['"]\/(tag|artist|parody|character|group|language|category)\/([^'"/]+)\/?['"][^>]*>([\s\S]*?)<\/a>/g)) {
    const label = decode(m[3].replace(/<span[^>]*(?:badge|count)[^>]*>[\s\S]*?<\/span>/g, ""));
    const name = (label || m[2].replace(/-/g, " ")).replace(/\s*\d+[KkMm]?$/, "").trim();
    if (name) (by[m[1]] ??= new Set()).add(name);
  }
  const list = (k: string) => [...(by[k] ?? [])];

  // image URLs: the thumbnail path gives host/dir/hash, g_th gives each page's file type
  const thumb = page.match(/(?:data-src|src)=["'](https?:\/\/[^"']+\/)1t\.(?:jpg|png|webp|gif)["']/);
  if (!thumb) throw new Error(`${cfg.name}: no thumbnail base on gallery`);
  let types: Record<string, string> = {};
  const assign = /\bg_th\s*=\s*(?:\$\.parseJSON\(\s*['"])?/.exec(page); // the real table, not the g_thumb CSS class
  const rawTh = assign ? objectAt(page, assign.index + assign[0].length) : null;
  if (rawTh) {
    try {
      const parsed = JSON.parse(rawTh) as Record<string, unknown>;
      types = (parsed.fl && typeof parsed.fl === "object" ? parsed.fl : parsed) as Record<string, string>;
    } catch {
      /* fall back to jpg below */
    }
  }
  const images = Array.from({ length: pages }, (_, i) => {
    const t = types[String(i + 1)]?.split(",")[0] ?? "j";
    return `${thumb[1]}${i + 1}.${EXT[t] ?? "jpg"}`;
  });

  return {
    id, title, pages, images,
    tags: list("tag"), artists: list("artist"), groups: list("group"), parodies: list("parody").filter((p) => p.toLowerCase() !== "original"),
    characters: list("character"), languages: list("language"), categories: list("category"),
  };
}

export async function downloadImage(cfg: SiteCfg, url: string): Promise<Buffer> {
  // the type table is authoritative, but if a file is missing under one extension try the others
  const alts = ["webp", "jpg", "png", "gif"].filter((e) => !url.endsWith("." + e)).map((e) => url.replace(/\.\w+$/, "." + e));
  try {
    return await fetchImage(cfg, url);
  } catch (e) {
    if (!/HTTP 404/.test((e as Error).message)) throw e;
    for (const alt of alts) {
      try {
        return await fetchImage(cfg, alt);
      } catch {
        /* try the next */
      }
    }
    throw e;
  }
}

async function fetchImage(cfg: SiteCfg, url: string): Promise<Buffer> {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, referer: cfg.base + "/" }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status === 404) break; // wrong extension guess or gone: retrying will not help
    } catch (e) {
      lastErr = e;
    }
    await sleep(700 * (i + 1));
  }
  throw lastErr instanceof Error ? lastErr : new Error("download failed");
}

export const categoryFor = (cats: string[]) => {
  const c = cats.map((x) => x.toLowerCase().replace(/[^a-z]/g, ""));
  if (c.includes("doujinshi")) return "DOUJINSHI";
  if (c.includes("manga")) return "MANGA";
  if (c.includes("artistcg")) return "ARTIST_CG";
  if (c.includes("gamecg")) return "GAME_CG";
  if (c.includes("imageset")) return "IMAGE_SET";
  if (c.includes("western")) return "WESTERN";
  return "OTHER";
};
