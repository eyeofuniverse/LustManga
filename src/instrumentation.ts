/**
 * On our own server the first visit after every deploy used to wait 10+ seconds (cold database connections, the slow
 * "latest updates" scan). Once the server is up it requests its busiest pages from itself, so a real visitor finds them warm.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.VERCEL) return;
  const origin = `http://127.0.0.1:${process.env.PORT || 3000}`;
  setTimeout(() => {
    void (async () => {
      for (const path of ["/", "/browse", "/updates", "/browse?sort=new", "/tags"]) {
        await fetch(origin + path, { headers: { cookie: "lm_age=1" }, signal: AbortSignal.timeout(60_000) }).catch(() => {});
      }
    })();
  }, 4000).unref();
}
