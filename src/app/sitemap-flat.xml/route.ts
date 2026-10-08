import { sitemapEntries, sitemapPlan } from "@/lib/sitemap-data";
import { renderUrlset } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** The hard limit for one sitemap file is 50,000 URLs; stay clear of it. */
const MAX_URLS = 45_000;

/**
 * Every URL in one file, to submit directly in Google Search Console. LustHentai found that a brand-new domain gets
 * a flat file crawled within a day, while an index of child files can sit unread for a week (the extra hop costs
 * priority). robots.txt and Bing keep using the index, which reports per type. Once the catalogue outgrows one
 * file this lists the main pages and the newest works, and the index covers the rest.
 */
export async function GET() {
  try {
    const plan = await sitemapPlan();
    const parts = await Promise.all(plan.map(async (p) => ({ kind: p.kind, entries: (await sitemapEntries(p.id)) ?? [] })));
    const of = (kind: string) => parts.filter((p) => p.kind === kind).flatMap((p) => p.entries);
    // main pages first, then works newest first (the files list them oldest first), then tags: if it must be cut, the tail goes
    const entries = [...of("pages"), ...of("works").reverse(), ...of("tags")].slice(0, MAX_URLS);
    return new Response(renderUrlset(entries), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return new Response("Service Unavailable", { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } });
  }
}
