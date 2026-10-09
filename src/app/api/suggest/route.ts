import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PREFS_COOKIE } from "@/lib/prefs";
import { prefsFromCookie } from "@/lib/prefs-server";
import { suggest } from "@/lib/queries";
import { stripNul } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = stripNul(new URL(req.url).searchParams.get("q") ?? "");
  const prefs = await prefsFromCookie((await cookies()).get(PREFS_COOKIE)?.value);
  try {
    const data = await suggest(q, prefs);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json({ tags: [], works: [] });
  }
}
