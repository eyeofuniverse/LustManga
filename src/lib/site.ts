export const SITE_NAME = "LustManga";
export const SITE_TAGLINE = "Manga & doujinshi, all languages";
/** Set NEXT_PUBLIC_CONTACT_EMAIL. Left empty, the legal pages point to the report form instead of showing a made-up address. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

/**
 * Canonical origin for canonical tags, sitemaps, structured data and share links. Set NEXT_PUBLIC_SITE_URL to the
 * real domain (https://example.com): on Vercel the fallbacks below are the project's *.vercel.app address, which is
 * not the address you want search engines to index.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "http://localhost:3000"
).replace(/\/+$/, "");

/**
 * Only the production deployment may be indexed. Every Vercel preview has its own address and would otherwise
 * appear in search results as a duplicate of the real site.
 */
export const IS_PRODUCTION = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : true;

/** Standard "Restricted To Adults" label that parental-control filters look for. */
export const RTA_LABEL = "RTA-5042-1996-1400-1577-RTA";

export const PAGE_SIZE = 24;
