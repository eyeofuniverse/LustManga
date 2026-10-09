import sharp, { type Metadata, type OutputInfo } from "sharp";

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
  /** the source file was cut off before its end; what could be decoded was kept (see looksCutOff) */
  truncated?: boolean;
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
/** libvips refuses to decode more than this many pixels, counted over every frame of an animation (sharp's own default) */
const PIXEL_LIMIT = 268_402_689;
/** a cut-off JPEG smaller than this is more likely a stub or an error page than a real page with its last rows missing */
const MIN_TRUNCATED_BYTES = 20_000;
/** a truncated page is kept while at least this share of it is real picture; less than that (3%) is a stub, not a page */
const MIN_REAL_SHARE = 0.03;
const CUT_OFF = /premature end|truncated|unexpected end|end of (input|file)/i;

/**
 * Decode (throws on truncated/corrupt input), normalise to WebP, report size + hash. Animated GIF /
 * WebP / APNG keep their animation. This doubles as the integrity check: an image that does not
 * decode never gets stored.
 */
export async function toWebp(input: Buffer, opts: { maxWidth?: number; maxPixels?: number } = {}): Promise<Processed> {
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
  const limit = opts.maxPixels ?? PIXEL_LIMIT;
  // a multi-frame file reports the height of one frame as pageHeight
  const frameHeight = probe.pageHeight ?? probe.height;
  const perFrame = probe.width * frameHeight;
  // an animation whose frames add up to more pixels than libvips will decode ("Input image exceeds pixel limit") keeps
  // its first frame as a still, the same as one with too many frames, instead of failing the whole chapter
  const animated = frames > 1 && frames <= MAX_FRAMES && perFrame * frames <= limit;

  return encode(input, { animated, frames, frameHeight, probe, opts, strict: true });
}

interface EncodeArgs {
  animated: boolean;
  frames: number;
  frameHeight: number;
  probe: Metadata;
  opts: { maxWidth?: number };
  strict: boolean;
}

async function encode(input: Buffer, a: EncodeArgs): Promise<Processed> {
  const { animated, frames, frameHeight, probe, opts } = a;
  let img = sharp(input, { failOn: a.strict ? "error" : "none", animated });
  if (probe.width > MAX_DIM || frameHeight > MAX_DIM || (opts.maxWidth && probe.width > opts.maxWidth)) {
    img = img.resize({
      width: opts.maxWidth ? Math.min(opts.maxWidth, MAX_DIM) : undefined,
      height: animated ? undefined : MAX_DIM,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await img.webp({ quality: 80, effort: animated ? 2 : 4 }).toBuffer({ resolveWithObject: true });
  } catch (e) {
    // Some sources serve one page with its last bytes missing, every time (the source's own readers see the same broken
    // page). Rather than lose the whole chapter, a 700-page gallery over one bad page, keep what decodes, flagged as
    // truncated. A file of real size is needed, and some of the picture has to be there.
    if (a.strict && CUT_OFF.test((e as Error).message) && input.length >= MIN_TRUNCATED_BYTES && (await realShare(input)) >= MIN_REAL_SHARE) {
      const lenient = await encode(input, { ...a, strict: false });
      return { ...lenient, truncated: true };
    }
    throw e;
  }
  const { data, info } = out;
  const height = animated ? (info.pageHeight ?? Math.round(info.height / frames)) : info.height;
  return { data, width: info.width, height, bytes: data.length, phash: await dhash(data), animated };
}

/**
 * How much of a leniently decoded page is real picture. libjpeg fills the part of a truncated JPEG it never received with
 * flat mid-gray (128), so the share is the rows above the gray block at the bottom. 0 when it cannot be read at all.
 */
export async function realShare(input: Buffer): Promise<number> {
  try {
    const { data, info } = await sharp(input, { failOn: "none" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const w = info.width;
    let gray = 0;
    for (let y = info.height - 1; y >= 0; y--) {
      let lo = 255;
      let hi = 0;
      let sum = 0;
      for (let x = 0; x < w; x++) {
        const v = data[y * w + x];
        sum += v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo <= 2 && Math.abs(sum / w - 128) <= 6) gray++;
      else break;
    }
    return 1 - gray / info.height;
  } catch {
    return 0;
  }
}
