import { sitemapEntries } from "@/lib/sitemap-data";
import { renderUrlset } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** One child sitemap, at /sitemap/<id>.xml. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const m = /^(\d{1,4})\.xml$/.exec((await ctx.params).id);
  if (!m) return new Response("Not Found", { status: 404 });
  try {
    const entries = await sitemapEntries(Number(m[1]));
    if (!entries) return new Response("Not Found", { status: 404 });
    return new Response(renderUrlset(entries), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return new Response("Service Unavailable", { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } });
  }
}
