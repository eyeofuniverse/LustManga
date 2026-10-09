import type { MetadataRoute } from "next";
import { IS_PRODUCTION } from "@/lib/site";
import { SITE } from "@/lib/seo";

/**
 * What crawlers may fetch. Blocked: places with nothing to index or an endless supply of URLs (search results,
 * the random redirect, per-visitor pages, the API). The reader (/read/) is deliberately NOT blocked: it is
 * noindex, and a crawler has to be able to fetch a page to see that. The console is not listed at all; naming it
 * here would only advertise it.
 */
export default function robots(): MetadataRoute.Robots {
  // a preview deployment must never be crawled: it is a duplicate of the real site under another address
  if (!IS_PRODUCTION) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // "/search?" and "/search$" block the result pages and the empty search, but not /search/help
        disallow: ["/api/", "/search?", "/search$", "/random", "/favorites", "/history", "/following", "/settings", "/report-content"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
