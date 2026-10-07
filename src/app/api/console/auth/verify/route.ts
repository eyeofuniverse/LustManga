import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/ratelimit";
import {
  readPending,
  clearPending,
  createAdminSession,
  recordAttempt,
} from "@/lib/admin/auth";
import { verifyTotp, matchBackupCode } from "@/lib/admin/totp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const pending = await readPending();
  if (!pending || pending.kind !== "totp") {
    return NextResponse.json({ error: "Session expired — sign in again." }, { status: 401 });
  }

  const admin = await prisma.adminUser
    .findUnique({ where: { id: pending.adminId } })
    .catch(() => null);
  if (!admin || !admin.active || !admin.totpSecret || !admin.totpEnabledAt) {
    return NextResponse.json({ error: "Account unavailable." }, { status: 401 });
  }

  const code = String((await req.json().catch(() => ({}))).code ?? "").trim();
  let good = code.length >= 6 && verifyTotp(admin.totpSecret, code);
  let usedBackupIdx = -1;
  if (!good && admin.backupCodes.length) {
    usedBackupIdx = await matchBackupCode(admin.backupCodes, code);
    good = usedBackupIdx >= 0;
  }

  if (!good) {
    await recordAttempt(admin.email, ip, false, "totp");
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  if (usedBackupIdx >= 0) {
    const left = admin.backupCodes.filter((_, i) => i !== usedBackupIdx);
    await prisma.adminUser.update({ where: { id: admin.id }, data: { backupCodes: left } });
  }

  await recordAttempt(admin.email, ip, true, "totp");
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip, failedLogins: 0 },
  });
  await clearPending();
  await createAdminSession(admin.id, { ip, userAgent: req.headers.get("user-agent") });

  return NextResponse.json({ ok: true });
}
