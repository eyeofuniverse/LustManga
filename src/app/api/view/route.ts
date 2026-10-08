import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Counts a view, at most once per work per visitor per 6 hours (a cookie per work). Feeds the Popular order. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse(null, { status: 400 });

  const cookie = `lmv${id}`;
  if (req.headers.get("cookie")?.includes(`${cookie}=1`)) return new NextResponse(null, { status: 204 });

  await prisma.work.updateMany({ where: { publicId: id, publish: "PUBLISHED" }, data: { views: { increment: 1 } } }).catch(() => {});
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(cookie, "1", { maxAge: 6 * 3600, path: "/", sameSite: "lax" });
  return res;
}
