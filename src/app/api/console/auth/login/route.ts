import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/ratelimit";
import { readJson } from "@/lib/url";
import {
  verifyPassword,
  isThrottled,
  recordAttempt,
  setPending,
} from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/** A real bcrypt hash (cost 12) of a random string nobody knows: what an unknown account is compared against. */
const DUMMY_HASH = "$2b$12$jWPhcqH/RS4MlWFimRSrd.KNzXgYGjwzYim/oJaIi4JUWnjj00vBK";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const body = await readJson(req);
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
  // The (deliberately slow) password check always runs, even for an unknown, inactive or locked account. Skipping it made the
  // answer arrive ~0.3 s sooner for an email that is not an admin, which tells an attacker which emails are admins.
  const passwordOk = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH);
  const ok = !!admin && admin.active && (!admin.lockedUntil || admin.lockedUntil < new Date()) && passwordOk;

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
