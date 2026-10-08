import "server-only";
import sharp from "sharp";
import { cdn } from "@/lib/cdn";

/**
 * Helpers for the generated share cards (opengraph-image.tsx). Two things the card renderer cannot do alone:
 * it cannot read WebP (our covers), and its built-in font has no Japanese or Chinese glyphs.
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
export const needsCjkFont = (text: string) => /[^\u0000-ɏ -⁯]/.test(text);

/**
 * Noto Sans JP, trimmed by Google Fonts to just the characters in `text`, so a Japanese or Chinese title renders
 * instead of boxes. A legacy User-Agent makes Google answer with a TrueType file, which the renderer can read.
 * Any failure returns null and the card falls back to the default font.
 */
export async function loadTitleFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@800&text=${encodeURIComponent(text)}`, {
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
