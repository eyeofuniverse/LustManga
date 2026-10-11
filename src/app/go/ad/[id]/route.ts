import { NextResponse } from "next/server";
import { prisma, db } from "@/lib/db";
import { isBot } from "@/lib/analytics/ua";
import { countClick, isAdId } from "@/lib/ads/serve";
import { safeUrl } from "@/lib/ads/validate";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/**
 * Where a banner ad's link goes. The click is counted, then the visitor is sent on to the advertiser's address, which an admin
 * entered and which was checked (http or https only) both when it was saved and again here. A robot following the link is
 * redirected but not counted. An unknown, paused or broken ad sends the visitor home instead of showing an error.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const home = NextResponse.redirect(new URL("/", req.url), { status: 302, headers: HEADERS });
  if (!isAdId(id)) return home;
  const ad = await db(() => prisma.ad.findUnique({ where: { id }, select: { active: true, type: true, linkUrl: true } })).catch(() => null);
  const to = ad && ad.active && ad.type === "banner" ? safeUrl(ad.linkUrl) : null;
  if (!to) return home;
  if (!isBot(req.headers.get("user-agent"))) await countClick(id).catch(() => {}); // awaited: a write deferred past the response can be lost
  return NextResponse.redirect(to, { status: 302, headers: HEADERS });
}
