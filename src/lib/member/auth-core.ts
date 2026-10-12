import "server-only";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BIO_MAX, checkBio, checkEmail, checkHandle, checkPassword } from "./rules";

/**
 * Sign-up, sign-in, recovery and account changes, apart from the cookie handling (session.ts) and the server actions that call
 * this (actions.ts). No email is required, so there is no mail to confirm: a lost password is recovered with one of the
 * recovery codes shown once at sign-up. Every failure message is the same for "no such account" and "wrong password".
 */
export type Out<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

const COST = 11;
const CODE_COST = 9;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/i/l
const CODE_COUNT = 8;
/** compared against when the account does not exist, so a missing account takes as long to refuse as a wrong password */
const DUMMY = bcrypt.hashSync("not-a-real-password", COST);

export const WRONG = "Wrong username or password.";
const SLOW_DOWN = "Too many attempts. Please wait a few minutes and try again.";

/* ───────────── throttling ───────────── */

export async function noteAttempt(kind: string, key: string, ok: boolean): Promise<void> {
  await prisma.memberAttempt.create({ data: { kind, key, ok } }).catch(() => {});
}
const failures = (kind: string, key: string, ms: number): Promise<number> =>
  prisma.memberAttempt.count({ where: { kind, key, ok: false, createdAt: { gt: new Date(Date.now() - ms) } } }).catch(() => 0);
const attempts = (kind: string, key: string, ms: number): Promise<number> =>
  prisma.memberAttempt.count({ where: { kind, key, createdAt: { gt: new Date(Date.now() - ms) } } }).catch(() => 0);

/* ───────────── recovery codes ───────────── */

/** "k7m2-9qxp" ... eight of them. Shown once; only their hashes are kept. */
export function newRecoveryCodes(): string[] {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return Array.from({ length: CODE_COUNT }, () => `${part()}-${part()}`);
}
export const codeKey = (code: string): string => code.toLowerCase().replace(/[^a-z0-9]/g, "");
const hashCodes = (codes: string[]) => Promise.all(codes.map((c) => bcrypt.hash(codeKey(c), CODE_COST)));

/* ───────────── sign up ───────────── */

export async function signUp(input: { username: unknown; password: unknown; email: unknown; ipKey: string }): Promise<Out<{ memberId: string; codes: string[] }>> {
  if ((await attempts("signup", input.ipKey, 3_600_000)) >= 4 || (await attempts("signup", input.ipKey, 86_400_000)) >= 10) return fail("Too many accounts were made from your connection recently. Please try again later.");
  const name = checkHandle(input.username);
  if (!name.ok) return fail(name.error);
  const pw = checkPassword(input.password, name.value.handle);
  if (!pw.ok) return fail(pw.error);
  const email = checkEmail(input.email);
  if (!email.ok) return fail(email.error);

  const codes = newRecoveryCodes();
  const [passwordHash, recoveryHashes] = await Promise.all([bcrypt.hash(pw.value, COST), hashCodes(codes)]);
  try {
    const m = await prisma.member.create({
      data: { handle: name.value.handle, displayName: name.value.displayName, email: email.value, passwordHash, recoveryHashes, lastLoginAt: new Date() },
      select: { id: true },
    });
    await noteAttempt("signup", input.ipKey, true);
    return { ok: true, memberId: m.id, codes };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
      await noteAttempt("signup", input.ipKey, false);
      return fail(target.includes("email") ? "That email address is already used by another account." : "That username is taken.");
    }
    throw e;
  }
}

/* ───────────── sign in ───────────── */

export async function signIn(input: { username: unknown; password: unknown; ipKey: string }): Promise<Out<{ memberId: string }>> {
  const handle = typeof input.username === "string" ? input.username.trim().toLowerCase().slice(0, 40) : "";
  const password = typeof input.password === "string" ? input.password.slice(0, 200) : "";
  if (!handle || !password) return fail(WRONG);
  const window = 15 * 60_000;
  // six misses for this name from this connection, fifteen from the connection in all, or forty for the name from anywhere (a spread-out
  // guesser): a stranger cannot lock the owner out of their own account by failing from somewhere else
  const pair = `${handle}|${input.ipKey}`;
  const [byPair, byIp, byName] = await Promise.all([failures("login", pair, window), failures("login", input.ipKey, window), failures("login", handle, window)]);
  if (byPair >= 6 || byIp >= 15 || byName >= 40) return fail(SLOW_DOWN);

  const m = await prisma.member.findUnique({ where: { handle }, select: { id: true, passwordHash: true } });
  const good = await bcrypt.compare(password, m?.passwordHash ?? DUMMY);
  if (!m || !good) {
    await Promise.all([noteAttempt("login", pair, false), noteAttempt("login", input.ipKey, false), noteAttempt("login", handle, false)]);
    return fail(WRONG);
  }
  await prisma.member.update({ where: { id: m.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
  return { ok: true, memberId: m.id };
}

/* ───────────── lost password ───────────── */

/** Use a recovery code to set a new password. The code is spent; the other codes stay valid. */
export async function resetWithCode(input: { username: unknown; code: unknown; password: unknown; ipKey: string }): Promise<Out<{ memberId: string; codesLeft: number }>> {
  const handle = typeof input.username === "string" ? input.username.trim().toLowerCase().slice(0, 40) : "";
  const code = typeof input.code === "string" ? codeKey(input.code) : "";
  const window = 30 * 60_000;
  const rpair = `${handle || "-"}|${input.ipKey}`;
  const [rPair, rIp, rName] = await Promise.all([failures("reset", rpair, window), failures("reset", input.ipKey, window), failures("reset", handle || "-", window)]);
  if (rPair >= 5 || rIp >= 10 || rName >= 30) return fail(SLOW_DOWN);
  const pw = checkPassword(input.password, handle);
  if (!pw.ok) return fail(pw.error);
  const wrong = "That username and recovery code do not match.";

  const m = handle ? await prisma.member.findUnique({ where: { handle }, select: { id: true, recoveryHashes: true } }) : null;
  let used = -1;
  if (m && code.length === 8) {
    for (let i = 0; i < m.recoveryHashes.length && used < 0; i++) if (await bcrypt.compare(code, m.recoveryHashes[i]!)) used = i;
  } else {
    await bcrypt.compare(code, DUMMY); // same time, whatever was typed
  }
  if (!m || used < 0) {
    await Promise.all([noteAttempt("reset", rpair, false), noteAttempt("reset", input.ipKey, false), noteAttempt("reset", handle || "-", false)]);
    return fail(wrong);
  }
  const left = m.recoveryHashes.filter((_, i) => i !== used);
  // spend the code only if nobody used it in the meantime
  const r = await prisma.member.updateMany({
    where: { id: m.id, recoveryHashes: { equals: m.recoveryHashes } },
    data: { passwordHash: await bcrypt.hash(pw.value, COST), recoveryHashes: left },
  });
  if (r.count !== 1) return fail(wrong);
  return { ok: true, memberId: m.id, codesLeft: left.length };
}

/* ───────────── account changes ───────────── */

async function passwordIs(memberId: string, password: unknown): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { passwordHash: true } });
  return !!m && typeof password === "string" && (await bcrypt.compare(password.slice(0, 200), m.passwordHash));
}

export async function changePassword(memberId: string, handle: string, input: { current: unknown; next: unknown; ipKey: string }): Promise<Out> {
  if ((await failures("login", handle, 15 * 60_000)) >= 40) return fail(SLOW_DOWN); // signed in already: only a flood from outside the account counts
  if (!(await passwordIs(memberId, input.current))) {
    await noteAttempt("login", handle, false);
    return fail("Your current password is not right.");
  }
  const pw = checkPassword(input.next, handle);
  if (!pw.ok) return fail(pw.error);
  await prisma.member.update({ where: { id: memberId }, data: { passwordHash: await bcrypt.hash(pw.value, COST) } });
  return { ok: true };
}

/** New recovery codes replace the old ones (so a lost list can be thrown away). Needs the password. */
export async function regenerateCodes(memberId: string, handle: string, password: unknown): Promise<Out<{ codes: string[] }>> {
  if ((await failures("login", handle, 15 * 60_000)) >= 40) return fail(SLOW_DOWN); // signed in already: only a flood from outside the account counts
  if (!(await passwordIs(memberId, password))) {
    await noteAttempt("login", handle, false);
    return fail("Your password is not right.");
  }
  const codes = newRecoveryCodes();
  await prisma.member.update({ where: { id: memberId }, data: { recoveryHashes: await hashCodes(codes) } });
  return { ok: true, codes };
}

export async function updateProfile(memberId: string, input: { displayName: unknown; bio: unknown; email: unknown; showRatings: unknown }): Promise<Out> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { handle: true } });
  if (!m) return fail("That account no longer exists.");
  // the display name can change its capitals, not its letters: the profile address is the same name
  const name = checkHandle(input.displayName);
  if (!name.ok || name.value.handle !== m.handle) return fail("Your display name can only change capital letters, not the letters themselves.");
  const bio = checkBio(input.bio);
  if (!bio.ok) return fail(bio.error);
  const email = checkEmail(input.email);
  if (!email.ok) return fail(email.error);
  try {
    await prisma.member.update({ where: { id: memberId }, data: { displayName: name.value.displayName, bio: bio.value, email: email.value, showRatings: input.showRatings === true || input.showRatings === "on" || input.showRatings === "true" } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("That email address is already used by another account.");
    throw e;
  }
  return { ok: true };
}

/**
 * Delete the account. Ratings are taken back out of each work's average, comments are emptied (a comment with replies stays as
 * "[deleted]" so the thread still reads), and everything else about the member goes with the row.
 */
export async function deleteAccount(memberId: string, handle: string, password: unknown): Promise<Out> {
  if ((await failures("login", handle, 15 * 60_000)) >= 40) return fail(SLOW_DOWN); // signed in already: only a flood from outside the account counts
  if (!(await passwordIs(memberId, password))) {
    await noteAttempt("login", handle, false);
    return fail("Your password is not right.");
  }
  // set-based, so a member with many ratings and votes costs a handful of statements, not one per row
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`UPDATE "Work" w SET "ratingSum" = w."ratingSum" - r.value, "ratingCount" = w."ratingCount" - 1 FROM "WorkRating" r WHERE r."workId" = w.id AND r."memberId" = ${memberId}`;
      // votes this member cast on other people comments leave their scores too
      await tx.$executeRaw`UPDATE "Comment" c SET score = c.score - v.value FROM "CommentVote" v WHERE v."commentId" = c.id AND v."memberId" = ${memberId}`;
      await tx.comment.updateMany({ where: { memberId }, data: { body: "", status: "REMOVED", memberId: null } });
      await tx.comment.deleteMany({ where: { body: "", status: "REMOVED", memberId: null, replies: { none: {} } } });
      await tx.member.delete({ where: { id: memberId } });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  return { ok: true };
}

export const BIO_LIMIT = BIO_MAX;
