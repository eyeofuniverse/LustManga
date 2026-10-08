export const SITE_NAME = "LustManga";
export const SITE_TAGLINE = "Manga & doujinshi, all languages";
/** Set NEXT_PUBLIC_CONTACT_EMAIL. Left empty, the legal pages point to the report form instead of showing a made-up address. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

/** Canonical origin for metadata, sitemaps and share links. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");

/** Standard "Restricted To Adults" label that parental-control filters look for. */
export const RTA_LABEL = "RTA-5042-1996-1400-1577-RTA";

export const PAGE_SIZE = 24;
