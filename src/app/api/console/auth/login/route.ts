import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/ratelimit";
import {
  verifyPassword,
  isThrottled,
  recordAttempt,
  setPending,
} from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  if (await isThrottled(email, ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } }).catch(() => null);
  const ok =
    !!admin &&
    admin.active &&
    (!admin.lockedUntil || admin.lockedUntil < new Date()) &&
    (await verifyPassword(password, admin.passwordHash));

  if (!admin || !ok) {
    await recordAttempt(email, ip, false, "password");
    if (admin) {
      const fails = admin.failedLogins + 1;
      await prisma.adminUser
        .update({
          where: { id: admin.id },
          data: {
            failedLogins: fails,
            lockedUntil: fails >= 8 ? new Date(Date.now() + 30 * 60_000) : admin.lockedUntil,
          },
        })
        .catch(() => {});
    }
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await recordAttempt(email, ip, true, "password");
  await prisma.adminUser
    .update({ where: { id: admin.id }, data: { failedLogins: 0, lockedUntil: null } })
    .catch(() => {});

  const next = admin.totpEnabledAt ? "totp" : "enroll";
  await setPending(admin.id, next === "totp" ? "totp" : "enroll");
  return NextResponse.json({ ok: true, next });
}
