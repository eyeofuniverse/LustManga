import { IS_PRODUCTION, SITE_URL } from "@/lib/site";

/** How long raw rows are kept. The cleanup job deletes older ones; the console says the same number. */
export const RETENTION_DAYS = Math.min(730, Math.max(7, Number(process.env.ANALYTICS_RETENTION_DAYS) || 120));

/**
 * Whether anything is measured at all. Only the real production site counts: a local build, a preview deployment and a test
 * run would otherwise fill the real numbers with our own clicks. ANALYTICS_FORCE=1 switches it on for a test server and
 * ANALYTICS=off switches it off everywhere (a kill switch that needs no deploy of code).
 */
export function analyticsEnabled(): boolean {
  if (process.env.ANALYTICS === "off") return false;
  if (process.env.ANALYTICS_FORCE === "1") return true;
  return IS_PRODUCTION && SITE_URL.startsWith("https://");
}

/** Hosts that count as "this site" for referrers and for the origin check. */
export function ownHosts(): string[] {
  const hosts = new Set<string>();
  try {
    const h = new URL(SITE_URL).host.toLowerCase();
    hosts.add(h);
    hosts.add(h.startsWith("www.") ? h.slice(4) : `www.${h}`);
  } catch {
    /* no valid site url */
  }
  if (process.env.ANALYTICS_FORCE === "1") hosts.add("localhost");
  return [...hosts];
}
