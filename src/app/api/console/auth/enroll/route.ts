import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/ratelimit";
import { readPending, clearPending, createAdminSession } from "@/lib/admin/auth";
import { verifyTotp, newBackupCodes } from "@/lib/admin/totp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const pending = await readPending();
  if (!pending || pending.kind !== "enroll") {
    return NextResponse.json({ error: "Session expired — sign in again." }, { status: 401 });
  }

  const admin = await prisma.adminUser
    .findUnique({ where: { id: pending.adminId } })
    .catch(() => null);
  if (!admin || !admin.active || !admin.totpSecret) {
    return NextResponse.json({ error: "Setup unavailable." }, { status: 400 });
  }
  if (admin.totpEnabledAt) {
    return NextResponse.json({ error: "Already enrolled." }, { status: 409 });
  }

  const code = String((await req.json().catch(() => ({}))).code ?? "").trim();
  if (!verifyTotp(admin.totpSecret, code)) {
    return NextResponse.json({ error: "That code didn't match — check the app time." }, { status: 400 });
  }

  const { plain, hashes } = await newBackupCodes();
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { totpEnabledAt: new Date(), backupCodes: hashes, failedLogins: 0 },
  });
  await clearPending();
  const ip = clientIp(req);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip },
  });
  await createAdminSession(admin.id, { ip, userAgent: req.headers.get("user-agent") });

  return NextResponse.json({ ok: true, backupCodes: plain });
}
