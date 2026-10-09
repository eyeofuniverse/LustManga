import { Zip, ZipPassThrough, strToU8 } from "fflate";

/**
 * Build a .cbz (a zip of the page images plus a ComicInfo.xml) in the browser, so downloading a chapter costs the
 * server nothing: the pages come straight from the image host and are zipped here. Any comic reader opens a CBZ.
 * The pages are already compressed WebP, so they are stored, not deflated again.
 */

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "001.webp": numbered so every reader sorts the pages in order, with the file's own extension. */
export function pageFileName(index: number, total: number, src: string): string {
  const width = Math.max(3, String(total).length);
  const ext = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(src)?.[1]?.toLowerCase() ?? "webp";
  return `${String(index + 1).padStart(width, "0")}.${ext}`;
}

/** A file name that is safe on every system: no path or reserved characters, no trailing dots, and not endless. */
export function safeFileName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return (cleaned || "download").slice(0, 120);
}

export interface ComicInfo {
  title: string;
  series: string;
  number?: string;
  pageCount: number;
  web?: string;
}

/** ComicInfo.xml: the metadata Komga, Kavita, Tachiyomi and most other readers pick up. */
export function comicInfoXml(i: ComicInfo): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n` +
    `  <Title>${xmlEsc(i.title)}</Title>\n  <Series>${xmlEsc(i.series)}</Series>\n${i.number ? `  <Number>${xmlEsc(i.number)}</Number>\n` : ""}` +
    `  <PageCount>${i.pageCount}</PageCount>\n${i.web ? `  <Web>${xmlEsc(i.web)}</Web>\n` : ""}  <AgeRating>Adults Only 18+</AgeRating>\n</ComicInfo>\n`
  );
}

/**
 * The image host answers cross-origin reads (CORS) only for responses it generated after that was switched on; a copy
 * a CDN edge cached earlier lacks the header. A distinct query makes the edge fetch a fresh copy with the header.
 */
export const forDownload = (src: string) => `${src}${src.includes("?") ? "&" : "?"}dl=1`;

export interface CbzRequest {
  pages: { src: string }[];
  info: ComicInfo;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** pages fetched at once */
  concurrency?: number;
}

async function fetchPage(src: string, signal?: AbortSignal): Promise<Uint8Array> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(forDownload(src), { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error("page failed to download");
}

/** Fetch every page (a few at a time), write them into the zip in order, and return the finished file. */
export async function buildCbz(req: CbzRequest): Promise<Blob> {
  const { pages, info, onProgress, signal } = req;
  const total = pages.length;
  const parts: Uint8Array[] = [];
  let finish!: (b: Blob) => void;
  let fail!: (e: unknown) => void;
  const result = new Promise<Blob>((res, rej) => {
    finish = res;
    fail = rej;
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) return fail(err);
    parts.push(chunk);
    if (final) finish(new Blob(parts as BlobPart[], { type: "application/vnd.comicbook+zip" }));
  });

  const meta = new ZipPassThrough("ComicInfo.xml");
  zip.add(meta);
  meta.push(strToU8(comicInfoXml(info)), true);

  const window = Math.max(1, Math.min(req.concurrency ?? 4, 8));
  const jobs: Promise<Uint8Array>[] = [];
  const start = (i: number) => {
    if (i < total && !jobs[i]) {
      jobs[i] = fetchPage(pages[i].src, signal);
      jobs[i].catch(() => {}); // surfaced when it is awaited in order below
    }
  };
  for (let i = 0; i < Math.min(window, total); i++) start(i);
  try {
    for (let i = 0; i < total; i++) {
      const data = await jobs[i];
      start(i + window);
      const file = new ZipPassThrough(pageFileName(i, total, pages[i].src));
      zip.add(file);
      file.push(data, true);
      onProgress?.(i + 1, total);
    }
    zip.end();
  } catch (e) {
    zip.terminate();
    throw e;
  }
  return result;
}

/** Hand a finished file to the browser's download. */
export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
