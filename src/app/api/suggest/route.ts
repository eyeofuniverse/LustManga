import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { suggest } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  try {
    const data = await suggest(q, prefs);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json({ tags: [], works: [] });
  }
}
