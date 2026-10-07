import sharp from "sharp";

/** The file can never be converted (unknown format). Retrying is pointless. */
export class UnsupportedImageError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "UnsupportedImageError";
  }
}

export interface Processed {
  data: Buffer;
  width: number;
  height: number;
  bytes: number;
  phash: string;
  animated: boolean;
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

/**
 * Animated AVIF (brand "avis") is how Hitomi stores GIFs. libvips cannot decode it, but browsers can
 * play it, so the caller stores such files untouched instead of failing the chapter.
 */
export const isAvifSequence = (buf: Buffer) => buf.subarray(4, 12).toString("latin1") === "ftypavis";

const MAX_DIM = 16000; // WebP hard limit is 16383
const MAX_FRAMES = 400; // beyond this an animation is stored as a still (memory and size)

/**
 * Decode (throws on truncated/corrupt input), normalise to WebP, report size + hash. Animated GIF /
 * WebP / APNG keep their animation. This doubles as the integrity check: an image that does not
 * decode never gets stored.
 */
export async function toWebp(input: Buffer, opts: { maxWidth?: number } = {}): Promise<Processed> {
  // Not a size floor: a legitimately blank page is only a few hundred bytes. Decoding below is the real check;
  // this just rejects empty bodies and stub responses before sharp is asked to look at them.
  if (input.length < 24) throw new Error(`image too small (${input.length} bytes)`);
  if (isAvifSequence(input)) throw new UnsupportedImageError("animated AVIF sequence cannot be re-encoded");

  const probe = await sharp(input, { failOn: "error" })
    .metadata()
    .catch((e: Error) => {
      if (/unsupported image format/i.test(e.message)) throw new UnsupportedImageError(e.message);
      throw e;
    });
  if (!probe.width || !probe.height) throw new Error("image has no dimensions");

  const frames = probe.pages ?? 1;
  const animated = frames > 1 && frames <= MAX_FRAMES;
  const frameHeight = animated ? (probe.pageHeight ?? Math.round(probe.height / frames)) : probe.height;

  let img = sharp(input, { failOn: "error", animated });
  if (probe.width > MAX_DIM || frameHeight > MAX_DIM || (opts.maxWidth && probe.width > opts.maxWidth)) {
    img = img.resize({
      width: opts.maxWidth ? Math.min(opts.maxWidth, MAX_DIM) : undefined,
      height: animated ? undefined : MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const { data, info } = await img.webp({ quality: 80, effort: animated ? 2 : 4 }).toBuffer({ resolveWithObject: true });
  const height = animated ? (info.pageHeight ?? Math.round(info.height / frames)) : info.height;
  return { data, width: info.width, height, bytes: data.length, phash: await dhash(data), animated };
}
