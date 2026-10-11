import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PREFS_COOKIE } from "@/lib/prefs";
import { prefsFromCookie } from "@/lib/prefs-server";
import { suggest } from "@/lib/queries";
import { clientIp, makeLimiter } from "@/lib/ratelimit";
import { stripNul } from "@/lib/url";

export const dynamic = "force-dynamic";

// every keystroke in the search box can end up here, and each call searches tags and works: a script must not be able to loop on it
const tooMany = makeLimiter(120, 60_000);

export async function GET(req: Request) {
  if (tooMany(clientIp(req))) return NextResponse.json({ tags: [], works: [] }, { status: 429, headers: { "Retry-After": "30" } });
  const q = stripNul(new URL(req.url).searchParams.get("q") ?? "");
  const prefs = await prefsFromCookie((await cookies()).get(PREFS_COOKIE)?.value);
  try {
    const data = await suggest(q, prefs);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json({ tags: [], works: [] });
  }
}
