import { SITE_NAME } from "@/lib/site";
import { SITE, abs } from "@/lib/seo";
import { esc } from "@/lib/sitemap-xml";

/** Lets a browser add the site to its search engines: type "LustManga", press Tab, search it directly. */
export function GET() {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">\n` +
    `<ShortName>${esc(SITE_NAME)}</ShortName>\n<Description>${esc(`Search manga and doujinshi on ${SITE_NAME}`)}</Description>\n` +
    `<InputEncoding>UTF-8</InputEncoding>\n<Image width="48" height="48" type="image/x-icon">${esc(abs("/favicon.ico"))}</Image>\n` +
    `<Url type="text/html" method="get" template="${esc(`${SITE}/search?q={searchTerms}`)}"/>\n</OpenSearchDescription>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/opensearchdescription+xml; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
