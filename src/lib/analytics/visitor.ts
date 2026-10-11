import { createHmac } from "node:crypto";
import { isIPv6 } from "node:net";

/**
 * The anonymous visitor id. It exists to answer "how many different browsers visited today", nothing more.
 *
 *   id = HMAC( HMAC(secret, "lp-analytics:" + UTC date), ip-key + "|" + user agent )   (first 20 hex digits kept)
 *
 * - The IP address and user agent are inputs to the hash and are never stored.
 * - The key changes every UTC day, so the same browser gets a different id tomorrow: nobody can be followed across days,
 *   and an old row cannot be matched to a new one, even by us.
 * - The key includes a server secret, so the ids cannot be reversed by trying every IPv4 address (there are only 4 billion).
 *   With no secret configured in production nothing is recorded at all (see secret()).
 * - A returning visitor therefore counts once per day. Totals over several days add the days up; they are "visitor-days".
 */
const LABEL = "lp-analytics";

export function secret(): string | null {
  const s = process.env.ANALYTICS_SALT || process.env.ADMIN_GATE_SECRET || "";
  if (s.length >= 16) return s;
  return process.env.NODE_ENV === "production" ? null : "insecure-dev-analytics-secret";
}

/** Browsers on IPv6 rotate the last 64 bits of their address for privacy; the first 64 identify the connection. */
export function ipKey(ip: string): string {
  const v = ip.trim().toLowerCase();
  if (!isIPv6(v)) return v;
  const [head, tail = ""] = v.split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const groups = v.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":");
}

export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export function visitorId(ip: string, ua: string, at: Date = new Date(), key: string | null = secret()): string | null {
  if (!key) return null;
  const dayKey = createHmac("sha256", key).update(`${LABEL}:${utcDay(at)}`).digest();
  return createHmac("sha256", dayKey).update(`${ipKey(ip)}|${ua}`).digest("hex").slice(0, 20);
}
