import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/ratelimit";
import { idParam } from "@/lib/url";

// best effort per server instance: stops a script from inflating views just by dropping the cookie each time
const hits = new Map<string, { n: number; reset: number }>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  return ++h.n > 40;
}

export const dynamic = "force-dynamic";

/** Counts a view, at most once per work per visitor per 6 hours (a cookie per work). Feeds the Popular order. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = idParam(body.id as number | string | undefined);
  if (id == null) return new NextResponse(null, { status: 400 });

  const cookie = `lmv${id}`;
  if (req.headers.get("cookie")?.includes(`${cookie}=1`)) return new NextResponse(null, { status: 204 });

  if (tooMany(clientIp(req))) return new NextResponse(null, { status: 204 });
  // raw SQL on purpose: a Prisma update would also bump updatedAt, and the sitemap reports that as "last modified"
  await prisma.$executeRaw`UPDATE "Work" SET views = views + 1 WHERE "publicId" = ${id} AND publish = 'PUBLISHED'`.catch(() => {});
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(cookie, "1", { maxAge: 6 * 3600, path: "/", sameSite: "lax" });
  return res;
}
