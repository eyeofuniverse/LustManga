import { fromOurSite } from "@/lib/analytics/collect";
import { isBot } from "@/lib/analytics/ua";
import { countImpression, isAdId } from "@/lib/ads/serve";
import { clientIp, makeLimiter } from "@/lib/ratelimit";
import { readJson } from "@/lib/url";

export const dynamic = "force-dynamic";

const tooMany = makeLimiter(90, 60_000);
const NONE = { status: 204, headers: { "Cache-Control": "no-store" } } as const;

/**
 * An ad box was shown: counted once it has been at least half in view for a second (the browser decides that, and never
 * before the age gate is passed). Anyone can call this, so it only ever adds one to a real ad's daily total, refuses other
 * websites and robots, and is rate limited. An ad network reports its own billed impressions; this is the site's own count.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && !fromOurSite(origin, req.headers.get("host"))) return new Response(null, { status: 403 });
  if (isBot(req.headers.get("user-agent"))) return new Response(null, NONE);
  const cookie = req.headers.get("cookie") ?? "";
  if (/(^|;\s*)lm_nocount=1/.test(cookie) || /(__Host-)?lm_session=/.test(cookie)) return new Response(null, NONE); // test runs and signed-in admins
  if (tooMany(clientIp(req))) return new Response(null, { status: 429 });
  const body = await readJson(req);
  if (!isAdId(body.ad)) return new Response(null, { status: 400 });
  await countImpression(body.ad).catch(() => {});
  return new Response(null, NONE);
}
