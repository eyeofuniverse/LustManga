import { SITE } from "@/lib/seo";

/**
 * IndexNow: tells Bing, Yandex, Seznam, Naver and others that URLs were added or changed, so new works are crawled
 * in minutes rather than weeks. The key is public by design: it only has to be served at /<key>.txt
 * (public/eed8d83efac81fa695d6faa0fcaf5ada.txt), which proves the site is ours.
 */
export const INDEXNOW_KEY = "eed8d83efac81fa695d6faa0fcaf5ada";

/** Endpoint accepts up to 10,000 URLs per request. */
const BATCH = 10_000;

/**
 * Submit absolute URLs or site paths. Never throws: a failed ping must not fail an ingest or an admin action.
 * Skipped on localhost and preview deployments, which are not the site search engines should crawl.
 */
export async function pingIndexNow(urlsOrPaths: string[]): Promise<{ submitted: number; failed: number; skipped?: string }> {
  if (!SITE.startsWith("https://")) return { submitted: 0, failed: 0, skipped: "site URL is not https (set NEXT_PUBLIC_SITE_URL)" };
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return { submitted: 0, failed: 0, skipped: "not the production deployment" };
  const host = new URL(SITE).host;
  const urls = [...new Set(urlsOrPaths.map((u) => (u.startsWith("http") ? u : `${SITE}${u.startsWith("/") ? "" : "/"}${u}`)))];
  let submitted = 0;
  let failed = 0;
  for (let i = 0; i < urls.length; i += BATCH) {
    const chunk = urls.slice(i, i + BATCH);
    try {
      const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: chunk }),
        signal: AbortSignal.timeout(20_000),
      });
      // 200 and 202 both mean accepted
      if (res.ok) submitted += chunk.length;
      else {
        failed += chunk.length;
        console.error(`IndexNow rejected ${chunk.length} URLs: ${res.status} ${(await res.text()).slice(0, 160)}`);
      }
    } catch (e) {
      failed += chunk.length;
      console.error(`IndexNow ping failed: ${(e as Error).message}`);
    }
  }
  return { submitted, failed };
}
