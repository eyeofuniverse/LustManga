import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, makeLimiter } from "@/lib/ratelimit";
import { idParam } from "@/lib/url";

// best effort per server instance: stops a script from inflating views just by dropping the cookie each time
const tooMany = makeLimiter(40, 60_000);

export const dynamic = "force-dynamic";

/**
 * Counts a view, at most once per work per visitor per 6 hours (a cookie per work). Feeds the Popular order and the
 * daily table behind Trending / This week / This month.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = idParam(body.id as number | string | undefined);
  if (id == null) return new NextResponse(null, { status: 400 });

  // test runs and anyone who sets this cookie are not counted (keeps QA traffic out of Popular and Trending)
  if (req.headers.get("cookie")?.includes("lm_nocount=1")) return new NextResponse(null, { status: 204 });

  const cookie = `lmv${id}`;
  if (req.headers.get("cookie")?.includes(`${cookie}=1`)) return new NextResponse(null, { status: 204 });
  if (tooMany(clientIp(req))) return new NextResponse(null, { status: 204 });

  // raw SQL on purpose: a Prisma update would also bump updatedAt, and the sitemap reports that as "last modified"
  await prisma.$executeRaw`UPDATE "Work" SET views = views + 1 WHERE "publicId" = ${id} AND publish = 'PUBLISHED'`.catch(() => {});
  await prisma.$executeRaw`
    INSERT INTO "WorkViewDay" ("workId", day, views)
    SELECT id, (now() AT TIME ZONE 'utc')::date, 1 FROM "Work" WHERE "publicId" = ${id} AND publish = 'PUBLISHED'
    ON CONFLICT ("workId", day) DO UPDATE SET views = "WorkViewDay".views + 1`.catch(() => {});
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(cookie, "1", { maxAge: 6 * 3600, path: "/", sameSite: "lax" });
  return res;
}
