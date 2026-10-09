import { prisma, db } from "@/lib/db";
import { cdn } from "@/lib/cdn";
import { categoryLabel, langLabel, workHref } from "@/lib/format";
import { cleanDescription } from "@/lib/text";
import { SITE_NAME } from "@/lib/site";
import { SITE, abs, clip } from "@/lib/seo";
import { esc } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** The 50 newest works as an RSS feed: feed readers, aggregators and some search engines use it to find new pages. */
export async function GET() {
  try {
    const works = await db(() =>
      prisma.work.findMany({
        where: { publish: "PUBLISHED", coverKey: { not: null }, pageCount: { gt: 0 } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { publicId: true, slug: true, title: true, description: true, language: true, category: true, pageCount: true, coverKey: true, createdAt: true },
      }),
    );
    const items = works
      .map((w) => {
        const link = abs(workHref(w));
        const cover = cdn(w.coverKey);
        const text = clip(cleanDescription(w.description) ?? "", 300);
        const body = `${langLabel(w.language)} ${categoryLabel(w.category).toLowerCase()}, ${w.pageCount} pages.${text ? ` ${text}` : ""}`;
        return (
          `<item><title>${esc(w.title)}</title><link>${esc(link)}</link><guid isPermaLink="true">${esc(link)}</guid>` +
          `<pubDate>${w.createdAt.toUTCString()}</pubDate><category>${esc(categoryLabel(w.category))}</category>` +
          `<description>${esc(body)}</description>${cover ? `<enclosure url="${esc(cover)}" type="image/webp" length="0"/>` : ""}</item>`
        );
      })
      .join("\n");
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>\n` +
      `<title>${esc(`${SITE_NAME}: new hentai manga & doujinshi`)}</title><link>${esc(SITE)}</link>` +
      `<description>${esc(`The newest hentai manga and doujinshi added to ${SITE_NAME}.`)}</description><language>en</language>` +
      `<atom:link href="${esc(`${SITE}/feed.xml`)}" rel="self" type="application/rss+xml"/>\n${items}\n</channel></rss>\n`;
    return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch {
    return new Response("Service Unavailable", { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } });
  }
}
