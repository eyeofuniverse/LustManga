/**
 * On our own server the first visit after every deploy used to wait 10+ seconds (cold database connections, the slow
 * "latest updates" scan), and so did the first visit after a quiet spell (the in-memory copies in lib/memo.ts expire after ten
 * times their age). Once the server is up it requests its busiest pages from itself, now and every four minutes, so a real
 * visitor, or a crawler, finds them warm. The requests stay on this machine and cost a handful of cached reads.
 */
const PAGES = ["/", "/browse", "/updates", "/browse?sort=new", "/tags"];

async function warm(origin: string) {
  for (const path of PAGES) {
    await fetch(origin + path, { headers: { cookie: "lm_age=1" }, signal: AbortSignal.timeout(60_000) }).catch(() => {});
  }
}

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.VERCEL) return;
  const origin = `http://127.0.0.1:${process.env.PORT || 3000}`;
  setTimeout(() => {
    void warm(origin);
    setInterval(() => void warm(origin), 4 * 60_000).unref();
  }, 4000).unref();
}
