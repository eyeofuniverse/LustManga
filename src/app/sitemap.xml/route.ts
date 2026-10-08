import { sitemapPlan } from "@/lib/sitemap-data";
import { renderIndex } from "@/lib/sitemap-xml";
import { SITE } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** The sitemap index that robots.txt and Search Console point at: one entry per child file (see lib/sitemap-data.ts). */
export async function GET() {
  try {
    const plan = await sitemapPlan();
    const xml = renderIndex(SITE, plan.map((p) => p.id), new Date().toISOString().slice(0, 10));
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    // database unreachable: ask crawlers to retry instead of caching a partial index
    return new Response("Service Unavailable", { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } });
  }
}
