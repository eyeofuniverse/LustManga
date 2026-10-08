export const SITE_NAME = "LustManga";
export const SITE_TAGLINE = "Manga & doujinshi, all languages";
/** Set NEXT_PUBLIC_CONTACT_EMAIL. Left empty, the legal pages point to the report form instead of showing a made-up address. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

/**
 * Reduce whatever was typed into NEXT_PUBLIC_SITE_URL to a clean origin: "example.com", "https://example.com/" and
 * "https://example.com/en" all become "https://example.com". A value without a scheme would otherwise crash the
 * build (new URL("example.com") throws), and a trailing slash would double every "//" in a sitemap.
 */
export function normalizeSiteUrl(raw: string | undefined | null): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin;
  } catch {
    return "";
  }
}

/**
 * Canonical origin for canonical tags, sitemaps, structured data and share links. Set NEXT_PUBLIC_SITE_URL to the
 * real domain: on Vercel the fallbacks below are the project's *.vercel.app address, which is not the address you
 * want search engines to index.
 */
export const SITE_URL =
  normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
  normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
  normalizeSiteUrl(process.env.VERCEL_URL) ||
  "http://localhost:3000";

/**
 * Only the production deployment may be indexed. Every Vercel preview has its own address and would otherwise
 * appear in search results as a duplicate of the real site.
 */
export const IS_PRODUCTION = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : true;

/** Standard "Restricted To Adults" label that parental-control filters look for. */
export const RTA_LABEL = "RTA-5042-1996-1400-1577-RTA";

export const PAGE_SIZE = 24;
