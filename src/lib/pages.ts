/**
 * Per-page data lives on the chapter as compact tuples instead of one database row per page.
 * Millions of pages would otherwise exhaust the database long before the image store.
 *   [width, height, bytes]            a WebP page
 *   [width, height, bytes, "avif"]    a page stored as-is (animated AVIF cannot be re-encoded)
 */
export type PageTuple = [width: number, height: number, bytes: number, ext?: string];

export interface PageInfo {
  n: number;
  key: string;
  width: number;
  height: number;
  bytes: number;
}

export const pageKey = (mediaId: string, chapterId: string, n: number, ext = "webp") => `w/${mediaId}/${chapterId}/${n}.${ext}`;

export function pagesOf(chapter: { id: string; pageData: unknown }, mediaId: string): PageInfo[] {
  const rows = Array.isArray(chapter.pageData) ? (chapter.pageData as PageTuple[]) : [];
  return rows.map((t, i) => ({ n: i + 1, key: pageKey(mediaId, chapter.id, i + 1, t[3] ?? "webp"), width: t[0], height: t[1], bytes: t[2] }));
}
