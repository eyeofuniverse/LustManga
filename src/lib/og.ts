import "server-only";
import sharp from "sharp";
import { cdn } from "@/lib/cdn";

/**
 * Helpers for the generated share cards (opengraph-image.tsx). Things the card renderer cannot do alone:
 * it cannot read WebP (our covers), and its built-in font has only Latin glyphs.
 */

/** A cover as a PNG data URI at the size it is drawn, or null if it cannot be fetched in time (the card just omits it). */
export async function coverDataUri(coverKey: string | null, width = 420, height = 630): Promise<string | null> {
  const url = cdn(coverKey);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const png = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(width, height, { fit: "cover", position: "top" })
      .png({ compressionLevel: 6 })
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** true when the text needs glyphs the default Latin font does not have */
export const needsExtraFont = (text: string) => /[^\u0000-ɏ -⁯]/.test(text);

/**
 * Scripts the card renderer cannot draw correctly even with a font: right-to-left and Indic scripts need shaping it
 * does not do. A title in one of those is replaced by a plain label rather than printed as scrambled or boxed glyphs.
 */
export const cannotDraw = (text: string) => /[֐-෿຀-႟]/.test(text);

const hasHangul = (t: string) => /[ᄀ-ᇿ㄰-㆏가-힯]/.test(t);
const hasThai = (t: string) => /[฀-๿]/.test(t);

async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@800&text=${encodeURIComponent(text)}`, {
        // a legacy User-Agent makes Google answer with a TrueType file, which the renderer can read (not WOFF2)
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1" },
        signal: AbortSignal.timeout(4000),
        next: { revalidate: 86400 },
      })
    ).text();
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    const font = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } });
    return font.ok ? await font.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * Fonts for a title that is not plain Latin, each trimmed by Google Fonts to just the characters used: Noto Sans JP
 * covers kana, Chinese characters, Cyrillic and Greek; Korean and Thai get their own. The renderer falls back from
 * one to the next glyph by glyph. A font that fails to load is simply left out.
 */
export async function loadTitleFonts(text: string): Promise<{ name: string; data: ArrayBuffer }[]> {
  const wanted = ["Noto Sans JP", ...(hasHangul(text) ? ["Noto Sans KR"] : []), ...(hasThai(text) ? ["Noto Sans Thai"] : [])];
  const loaded = await Promise.all(wanted.map(async (name) => ({ name, data: await loadGoogleFont(name, text) })));
  return loaded.filter((f): f is { name: string; data: ArrayBuffer } => !!f.data);
}
