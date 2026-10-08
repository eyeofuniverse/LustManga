/** Pure sitemap pieces (no database): how the files are split, and how they are written. */

export const TAGS_PER_SITEMAP = 10_000;
export const WORKS_PER_SITEMAP = 5_000; // well under the 50,000-URL limit per file

export interface SitemapEntry {
  /** absolute, already percent-encoded */
  url: string;
  lastmod?: string;
  /** absolute cover image */
  image?: string;
}

export type SitemapPart = { id: number; kind: "pages" } | { id: number; kind: "tags"; chunk: number } | { id: number; kind: "works"; chunk: number };

/** 0 = main pages, then tag files, then work files. Always at least the main pages. */
export function planSitemaps(tagCount: number, workCount: number): SitemapPart[] {
  const parts: SitemapPart[] = [{ id: 0, kind: "pages" }];
  const tagFiles = Math.ceil(tagCount / TAGS_PER_SITEMAP);
  const workFiles = Math.ceil(workCount / WORKS_PER_SITEMAP);
  for (let i = 0; i < tagFiles; i++) parts.push({ id: parts.length, kind: "tags", chunk: i });
  for (let i = 0; i < workFiles; i++) parts.push({ id: parts.length, kind: "works", chunk: i });
  return parts;
}

export const esc = (v: string | number) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function renderUrlset(entries: SitemapEntry[]): string {
  const body = entries
    .map(
      (e) =>
        `<url><loc>${esc(e.url)}</loc>${e.lastmod ? `<lastmod>${esc(e.lastmod)}</lastmod>` : ""}${e.image ? `<image:image><image:loc>${esc(e.image)}</image:loc></image:image>` : ""}</url>`,
    )
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    `${body}\n</urlset>\n`
  );
}

export function renderIndex(site: string, ids: number[], lastmod: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ids.map((id) => `<sitemap><loc>${esc(`${site}/sitemap/${id}.xml`)}</loc><lastmod>${esc(lastmod)}</lastmod></sitemap>`).join("\n") +
    `\n</sitemapindex>\n`
  );
}
