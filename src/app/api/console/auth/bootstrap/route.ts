import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/ratelimit";
import { hashPassword, setPending, constEq, recordAttempt } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/** One-time creation of the first (OWNER) admin. Disabled forever once any
 *  admin exists. Gated by the ADMIN_BOOTSTRAP_SECRET env var. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const count = await prisma.adminUser.count().catch(() => 1);
  if (count > 0) {
    return NextResponse.json({ error: "Already initialised." }, { status: 403 });
  }

  const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const given = String(body.secret ?? "");

  if (!secret || !constEq(given, secret)) {
    await recordAttempt(email || "bootstrap", ip, false, "bootstrap");
    return NextResponse.json({ error: "Invalid setup key." }, { status: 403 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 12) {
    return NextResponse.json(
      { error: "Enter a valid email and a password of at least 12 characters." },
      { status: 400 },
    );
  }

  const admin = await prisma.adminUser.create({
    data: { email, passwordHash: await hashPassword(password), role: "OWNER" },
  });
  await recordAttempt(email, ip, true, "bootstrap");
  await setPending(admin.id, "enroll");
  return NextResponse.json({ ok: true, next: "enroll" });
}
