import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, makeLimiter } from "@/lib/ratelimit";
import { idParam } from "@/lib/url";

export const dynamic = "force-dynamic";

const tooMany = makeLimiter(30, 60_000);

/**
 * The public "saved" count. A visitor's own library lives in their browser; this only adds one to the work's
 * counter when they save it and takes it back when they un-save, once per visitor per work (a one-year cookie
 * remembers that this browser has been counted). It feeds the "Most saved" sort and the Popular order.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; on?: unknown };
  const id = idParam(body.id as number | string | undefined);
  if (id == null || typeof body.on !== "boolean") return new NextResponse(null, { status: 400 });

  if (req.headers.get("cookie")?.includes("lm_nocount=1")) return new NextResponse(null, { status: 204 }); // not counted: see /api/view

  const cookie = `lmf${id}`;
  const counted = req.headers.get("cookie")?.includes(`${cookie}=1`) ?? false;
  if (body.on === counted) return new NextResponse(null, { status: 204 }); // already in that state
  if (tooMany(clientIp(req))) return new NextResponse(null, { status: 429 });

  // raw SQL on purpose: a Prisma update would bump updatedAt, which the sitemap reports as "last modified"
  if (body.on) await prisma.$executeRaw`UPDATE "Work" SET favorites = favorites + 1 WHERE "publicId" = ${id} AND publish = 'PUBLISHED'`.catch(() => {});
  else await prisma.$executeRaw`UPDATE "Work" SET favorites = GREATEST(favorites - 1, 0) WHERE "publicId" = ${id}`.catch(() => {});
  const res = new NextResponse(null, { status: 204 });
  if (body.on) res.cookies.set(cookie, "1", { maxAge: 365 * 86400, path: "/", sameSite: "lax" });
  else res.cookies.set(cookie, "", { maxAge: 0, path: "/" });
  return res;
}
