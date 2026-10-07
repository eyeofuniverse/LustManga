import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const PROD = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = PROD ? "__Host-lm_session" : "lm_session";
export const GATE_COOKIE = PROD ? "__Host-lm_gate" : "lm_gate";
export const PENDING_COOKIE = PROD ? "__Host-lm_pending" : "lm_pending";

const SESSION_TTL_MS = 12 * 60 * 60_000; // 12h sliding
const SESSION_ABS_MS = 7 * 24 * 60 * 60_000; // 7d hard cap
const PENDING_TTL_MS = 10 * 60_000; // 10 min to finish 2FA / enrolment

const HMAC_SECRET =
  process.env.ADMIN_GATE_SECRET ||
  process.env.STREAM_SECRET ||
  process.env.CRON_SECRET ||
  "insecure-dev-gate-secret";

export type AdminRole = "OWNER" | "ADMIN" | "MOD";
export type AdminIdentity = {
  id: string;
  email: string;
  role: AdminRole;
  displayName: string | null;
  sessionId: string;
};

/* passwords */
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/* opaque session tokens — only the sha256 is stored */
function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function cookieOpts(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: PROD,
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export function constEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/* create / read / revoke sessions */

export async function createAdminSession(
  adminId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const { token, hash } = newToken();
  await prisma.adminSession.create({
    data: {
      adminId,
      tokenHash: hash,
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(SESSION_TTL_MS / 1000));
}

export const getAdminSession = cache(async (): Promise<AdminIdentity | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const s = await prisma.adminSession
    .findUnique({ where: { tokenHash: hashToken(token) }, include: { admin: true } })
    .catch(() => null);

  if (
    !s ||
    !s.admin.active ||
    s.expiresAt.getTime() < Date.now() ||
    s.createdAt.getTime() + SESSION_ABS_MS < Date.now()
  ) {
    return null;
  }

  if (Date.now() - s.lastSeenAt.getTime() > 5 * 60_000) {
    const newExp = new Date(
      Math.min(Date.now() + SESSION_TTL_MS, s.createdAt.getTime() + SESSION_ABS_MS),
    );
    await prisma.adminSession
      .update({ where: { id: s.id }, data: { lastSeenAt: new Date(), expiresAt: newExp } })
      .catch(() => {});
  }

  return {
    id: s.admin.id,
    email: s.admin.email,
    role: s.admin.role as AdminRole,
    displayName: s.admin.displayName,
    sessionId: s.id,
  };
});

export async function revokeCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.adminSession
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(adminId: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { adminId } }).catch(() => {});
}

const ROLE_RANK: Record<AdminRole, number> = { MOD: 1, ADMIN: 2, OWNER: 3 };

export class AdminForbidden extends Error {
  constructor() {
    super("Admin access required");
    this.name = "AdminForbidden";
  }
}

export async function requireAdmin(min: AdminRole = "MOD"): Promise<AdminIdentity> {
  const me = await getAdminSession();
  if (!me || ROLE_RANK[me.role] < ROLE_RANK[min]) throw new AdminForbidden();
  return me;
}

/* short-lived signed "pending 2FA" cookie between the password step and TOTP */

type PendingKind = "totp" | "enroll";

export async function setPending(adminId: string, kind: PendingKind): Promise<void> {
  const exp = Date.now() + PENDING_TTL_MS;
  const body = `${kind}.${adminId}.${exp}`;
  const sig = createHmac("sha256", HMAC_SECRET).update(body).digest("base64url");
  (await cookies()).set(PENDING_COOKIE, `${body}.${sig}`, cookieOpts(PENDING_TTL_MS / 1000));
}

export async function readPending(): Promise<{ adminId: string; kind: PendingKind } | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [kind, adminId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!["totp", "enroll"].includes(kind) || !adminId || !Number.isFinite(exp)) return null;
  if (Date.now() > exp) return null;
  const want = createHmac("sha256", HMAC_SECRET)
    .update(`${kind}.${adminId}.${expStr}`)
    .digest("base64url");
  if (!constEq(want, sig)) return null;
  return { adminId, kind: kind as PendingKind };
}

export async function clearPending(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

/* rate limiting / lockout */

const MAX_FAILS = 6;
const LOCK_MS = 15 * 60_000;

export async function recordAttempt(
  email: string,
  ip: string,
  ok: boolean,
  reason?: string,
): Promise<void> {
  await prisma.adminLoginAttempt
    .create({
      data: { email: email.toLowerCase().slice(0, 200), ip: ip.slice(0, 64), ok, reason },
    })
    .catch(() => {});
}

export async function isThrottled(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCK_MS);
  const [byEmail, byIp] = await Promise.all([
    prisma.adminLoginAttempt.count({
      where: { email: email.toLowerCase(), ok: false, createdAt: { gt: since } },
    }),
    prisma.adminLoginAttempt.count({ where: { ip, ok: false, createdAt: { gt: since } } }),
  ]).catch(() => [0, 0]);
  return byEmail >= MAX_FAILS || byIp >= MAX_FAILS * 2;
}
