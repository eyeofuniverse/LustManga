import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PREFS_COOKIE } from "@/lib/prefs";
import { prefsFromCookie } from "@/lib/prefs-server";
import { randomPublicId } from "@/lib/queries";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Surprise me: a random published work, respecting the visitor's language and hidden-tag choices. */
export async function GET(req: Request) {
  const prefs = await prefsFromCookie((await cookies()).get(PREFS_COOKIE)?.value);
  const id = await randomPublicId(prefs).catch(() => null);
  const target = id ? `/g/${id}` : "/browse";
  const res = NextResponse.redirect(new URL(target, SITE_URL), 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
