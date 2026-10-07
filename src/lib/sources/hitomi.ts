import { Http, UA } from "@/lib/http";

export const SITE = "hitomi";
const LTN = "https://ltn.gold-usergeneratedcontent.net";
const HEADERS = { referer: "https://hitomi.la/", origin: "https://hitomi.la" };

// Gallery metadata is tiny JSON; keep a modest gap so the index host is never hammered.
const meta = new Http(120, HEADERS);

/** our language code -> Hitomi's language name (used in index file names) */
export const LANGUAGES: Record<string, string> = {
  en: "english", ja: "japanese", zh: "chinese", ko: "korean", es: "spanish", fr: "french", de: "german",
  ru: "russian", it: "italian", pt: "portuguese", th: "thai", vi: "vietnamese", id: "indonesian",
  pl: "polish", tr: "turkish",
};
const CODE_BY_NAME = Object.fromEntries(Object.entries(LANGUAGES).map(([c, n]) => [n, c]));
export const langCode = (name: string | null | undefined) => (name ? (CODE_BY_NAME[name] ?? name.slice(0, 3)) : "und");

export interface HFile {
  hash: string;
  name: string;
  width: number;
  height: number;
  hasavif?: number;
  haswebp?: number;
}
export interface HGallery {
  id: string;
  title: string;
  japanese_title: string | null;
  type: string;
  language: string | null;
  date: string | null;
  datepublished: string | null;
  blocked: number;
  artists: { artist: string }[] | null;
  groups: { group: string }[] | null;
  parodys: { parody: string }[] | null;
  characters: { character: string }[] | null;
  tags: { tag: string; female?: string; male?: string }[] | null;
  languages: { galleryid: number | string; name: string }[] | null;
  files: HFile[];
}

/**
 * IDs from a Hitomi .nozomi index (big-endian int32 list, best first / newest first), read with a
 * Range request so we never pull a multi-megabyte index for a page of results.
 */
export async function listIds(path: string, offset: number, count: number): Promise<{ ids: number[]; total: number }> {
  const res = await meta.request(`${LTN}/${path}`, {
    headers: { range: `bytes=${offset * 4}-${(offset + count) * 4 - 1}` },
  });
  if (res.status === 416) return { ids: [], total: 0 }; // past the end
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status} ${path}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ids: number[] = [];
  for (let i = 0; i + 4 <= buf.length; i += 4) ids.push(buf.readInt32BE(i));
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? 0) / 4;
  return { ids, total };
}

export const indexPath = (mode: "popular" | "recent", lang: string) =>
  mode === "popular" ? `popular/year-${LANGUAGES[lang]}.nozomi` : `index-${LANGUAGES[lang]}.nozomi`;

export async function getGallery(id: number): Promise<HGallery | null> {
  const res = await meta.request(`${LTN}/galleries/${id}.js`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} gallery ${id}`);
  const text = await res.text();
  try {
    return JSON.parse(text.replace(/^var galleryinfo\s*=\s*/, "")) as HGallery;
  } catch {
    throw new Error(`gallery ${id}: unparseable metadata`);
  }
}

/* ───────── image URLs: derived from gg.js (rotates roughly hourly) ───────── */

interface GG {
  b: string;
  defaultO: number;
  caseO: number;
  cases: Set<number>;
  at: number;
}
let gg: GG | null = null;
const GG_TTL = 5 * 60_000;

async function loadGG(force = false): Promise<GG> {
  if (!force && gg && Date.now() - gg.at < GG_TTL) return gg;
  const text = await (await meta.request(`${LTN}/gg.js`)).text();
  const b = text.match(/b:\s*'([^']+)'/)?.[1];
  const defaultO = Number(text.match(/var o = (\d)/)?.[1]);
  const caseO = Number(text.match(/o = (\d); break;/)?.[1]);
  if (!b || Number.isNaN(defaultO) || Number.isNaN(caseO)) throw new Error("gg.js: unrecognised format (Hitomi changed it)");
  gg = { b, defaultO, caseO, cases: new Set([...text.matchAll(/case (\d+):/g)].map((m) => Number(m[1]))), at: Date.now() };
  return gg;
}

function imageUrl(f: HFile, g: GG): string {
  const h = f.hash;
  const s = parseInt(h.slice(-1) + h.slice(-3, -1), 16);
  const o = g.cases.has(s) ? g.caseO : g.defaultO;
  const ext = f.hasavif ? "avif" : f.haswebp ? "webp" : null;
  if (!ext) throw new Error("file has no avif/webp variant");
  const base = ext === "avif" ? "a" : "w";
  return `https://${base}${o + 1}.gold-usergeneratedcontent.net/${g.b}${s}/${h}.${ext}`;
}

/** Download one page. If the URL 404s the gg.js prefix has probably rotated: refresh it once and retry. */
export async function downloadPage(f: HFile): Promise<Buffer> {
  let g = await loadGG();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(imageUrl(f, g), {
        headers: { "user-agent": UA, ...HEADERS },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 404 && attempt === 0) {
        g = await loadGG(true);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
  }
  throw new Error("download failed");
}

export const names = (g: HGallery) => ({
  tags: (g.tags ?? []).map((t) => t.tag),
  artists: (g.artists ?? []).map((a) => a.artist),
  groups: (g.groups ?? []).map((x) => x.group),
  parodies: (g.parodys ?? []).map((p) => p.parody).filter((p) => p.toLowerCase() !== "original"),
  characters: (g.characters ?? []).map((c) => c.character),
});

/** Hitomi's type -> our category */
export const categoryFor = (type: string) =>
  (({
    doujinshi: "DOUJINSHI",
    manga: "MANGA",
    artistcg: "ARTIST_CG",
    gamecg: "GAME_CG",
    imageset: "IMAGE_SET",
  }) as Record<string, string>)[type] ?? "OTHER";
