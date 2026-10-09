export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "0.0.0.0";
}

/**
 * A small in-memory limiter, per server instance and per key (usually an IP). It cannot stop a determined attacker
 * (serverless instances do not share memory) but it stops a script that hammers one endpoint, which is what the
 * public counters (views, saves) need. Returns true when the caller has gone over `max` in the current window.
 */
export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    const h = hits.get(key);
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + windowMs });
      return false;
    }
    return ++h.n > max;
  };
}
