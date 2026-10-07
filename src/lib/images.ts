import sharp from "sharp";

export interface Processed {
  data: Buffer;
  width: number;
  height: number;
  bytes: number;
  phash: string;
}

/** 64-bit difference hash, hex. Cheap perceptual fingerprint for cross-source dedupe. */
export async function dhash(input: Buffer): Promise<string> {
  const { data } = await sharp(input).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

const MAX_DIM = 16000; // WebP hard limit is 16383

/**
 * Decode (throws on truncated/corrupt input), normalise to WebP, report size + hash.
 * This doubles as the integrity check: an image that doesn't decode never gets stored.
 */
export async function toWebp(input: Buffer, opts: { maxWidth?: number } = {}): Promise<Processed> {
  if (input.length < 500) throw new Error(`image too small (${input.length} bytes)`);
  let img = sharp(input, { failOn: "error", animated: false });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("image has no dimensions");
  if (meta.height > MAX_DIM || meta.width > MAX_DIM || (opts.maxWidth && meta.width > opts.maxWidth)) {
    img = img.resize({
      width: opts.maxWidth ? Math.min(opts.maxWidth, MAX_DIM) : undefined,
      height: MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const { data, info } = await img.webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, bytes: data.length, phash: await dhash(data) };
}
