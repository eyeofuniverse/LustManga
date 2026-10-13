import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Who is signed in. A session is an opaque random token in an httpOnly cookie; only its sha256 is stored, so a copy of the
 * database cannot sign anyone in. The cookie is SameSite=Lax (not Strict) so that following a link to the site from
 * elsewhere does not look like being signed out, and "__Host-" in production (secure, no Domain, whole site).
 */
const PROD = process.env.NODE_ENV === "production";
export const MEMBER_COOKIE = PROD ? "__Host-lm_member" : "lm_member";
const TTL_MS = 30 * 24 * 3_600_000; // sliding
const ABS_MS = 90 * 24 * 3_600_000; // hard cap
const TOUCH_MS = 10 * 60_000;

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const cookieOpts = (maxAgeSec: number) => ({ httpOnly: true, secure: PROD, sameSite: "lax" as const, path: "/", maxAge: maxAgeSec });

export interface Me {
  id: string;
  handle: string;
  displayName: string;
  banned: boolean;
  bannedReason: string | null;
  showRatings: boolean;
  bio: string | null;
  email: string | null;
  createdAt: Date;
}

/** The address of the request, for rate limits only. Never stored as is (see hashKey). */
export async function requestIp(): Promise<string> {
  const h = await headers();
  return (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "0.0.0.0").trim();
}

/** A one-way key for a rate limit: the same input always gives the same key, and the input cannot be recovered from it. */
export const hashKey = (value: string): string => sha(`${value}|${process.env.ADMIN_GATE_SECRET ?? "dev"}`).slice(0, 32);

export async function startSession(memberId: string): Promise<void> {
  // signing in from a browser that already holds a session ends that one (no orphaned rows, nothing carried over)
  const jar = await cookies();
  const before = jar.get(MEMBER_COOKIE)?.value;
  if (before) await prisma.memberSession.deleteMany({ where: { tokenHash: sha(before) } }).catch(() => {});
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  await prisma.memberSession.create({
    data: { memberId, tokenHash: sha(token), userAgent: h.get("user-agent")?.slice(0, 300) ?? null, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  jar.set(MEMBER_COOKIE, token, cookieOpts(TTL_MS / 1000));
}

/** The signed-in member, or null. One lookup per request however many components ask. */
export const getMember = cache(async (): Promise<Me | null> => {
  const token = (await cookies()).get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.memberSession
    .findUnique({
      where: { tokenHash: sha(token) },
      include: { member: { select: { id: true, handle: true, displayName: true, banned: true, bannedReason: true, showRatings: true, bio: true, email: true, createdAt: true } } },
    })
    .catch(() => null);
  if (!s || s.expiresAt.getTime() < Date.now() || s.createdAt.getTime() + ABS_MS < Date.now()) return null;
  if (Date.now() - s.lastSeenAt.getTime() > TOUCH_MS) {
    const expiresAt = new Date(Math.min(Date.now() + TTL_MS, s.createdAt.getTime() + ABS_MS));
    await prisma.memberSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(), expiresAt } }).catch(() => {});
  }
  return s.member;
});

/** The signed-in member who may act: not banned. Throws NotSignedIn / Banned for the actions to turn into a message. */
export class NotSignedIn extends Error {
  constructor() {
    super("Sign in to do that.");
  }
}
export class Banned extends Error {
  constructor() {
    super("This account cannot post.");
  }
}
export async function requireMember(): Promise<Me> {
  const me = await getMember();
  if (!me) throw new NotSignedIn();
  if (me.banned) throw new Banned();
  return me;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(MEMBER_COOKIE)?.value;
  if (token) await prisma.memberSession.deleteMany({ where: { tokenHash: sha(token) } }).catch(() => {});
  // expired with the same attributes it was set with: a "__Host-" cookie is refused unless it says Secure and Path=/, and cookies().delete() does not
  jar.set(MEMBER_COOKIE, "", { ...cookieOpts(0), expires: new Date(0) });
}

/** Sign a member out everywhere (after a password change or reset). `keepToken` leaves the browser that asked signed in. */
export async function endAllSessions(memberId: string, except?: { keepCurrent: boolean }): Promise<void> {
  const keep = except?.keepCurrent ? (await cookies()).get(MEMBER_COOKIE)?.value : undefined;
  await prisma.memberSession.deleteMany({ where: { memberId, ...(keep ? { tokenHash: { not: sha(keep) } } : {}) } }).catch(() => {});
}
