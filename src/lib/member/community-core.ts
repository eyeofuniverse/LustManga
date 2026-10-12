import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AUTO_HIDE_REPORTS, checkComment, fingerprint, isReason, limitsFor } from "./rules";
import { noteAttempt, type Out } from "./auth-core";

/**
 * Ratings, comments, votes and comment reports: everything a signed-in member can do on a work. The caller has already
 * proved who the member is (and that they are not banned); every rule that protects the community is checked again here.
 */
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
type Who = { id: string; createdAt: Date };

async function workIdOf(publicId: unknown): Promise<string | null> {
  const n = typeof publicId === "number" ? publicId : Number(publicId);
  if (!Number.isInteger(n) || n < 1 || n > 2_147_483_647) return null;
  const w = await prisma.work.findFirst({ where: { publicId: n, publish: "PUBLISHED" }, select: { id: true } });
  return w?.id ?? null;
}

/* ───────────── ratings ───────────── */

/** Set (1-5) or take back (0) a member's rating of a work, keeping the work's sum and count in step. */
export async function rateWork(me: Who, publicId: unknown, value: unknown): Promise<Out<{ sum: number; count: number; mine: number }>> {
  const v = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(v) || v < 0 || v > 5) return fail("Pick 1 to 5 stars.");
  const workId = await workIdOf(publicId);
  if (!workId) return fail("That work is not available.");
  if (v > 0 && (await prisma.memberAttempt.count({ where: { kind: "rate", key: me.id, createdAt: { gt: new Date(Date.now() - 600_000) } } })) >= 40) return fail("You are rating very fast. Please slow down a little.");
  await noteAttempt("rate", me.id, true);
  const w = await prisma.$transaction(async (tx) => {
    const old = await tx.workRating.findUnique({ where: { memberId_workId: { memberId: me.id, workId } }, select: { value: true } });
    if (v === 0) {
      if (old) {
        await tx.workRating.delete({ where: { memberId_workId: { memberId: me.id, workId } } });
        await tx.work.update({ where: { id: workId }, data: { ratingSum: { decrement: old.value }, ratingCount: { decrement: 1 } } });
      }
    } else if (old) {
      if (old.value !== v) {
        await tx.workRating.update({ where: { memberId_workId: { memberId: me.id, workId } }, data: { value: v } });
        await tx.work.update({ where: { id: workId }, data: { ratingSum: { increment: v - old.value } } });
      }
    } else {
      await tx.workRating.create({ data: { memberId: me.id, workId, value: v } });
      await tx.work.update({ where: { id: workId }, data: { ratingSum: { increment: v }, ratingCount: { increment: 1 } } });
    }
    return tx.work.findUniqueOrThrow({ where: { id: workId }, select: { ratingSum: true, ratingCount: true } });
  }, { timeout: 20_000, maxWait: 10_000 });
  return { ok: true, sum: w.ratingSum, count: w.ratingCount, mine: v };
}

/* ───────────── comments ───────────── */

export async function postComment(me: Who, input: { work: unknown; body: unknown; parentId?: unknown }): Promise<Out<{ id: string }>> {
  const body = checkComment(input.body);
  if (!body.ok) return fail(body.error);
  const workId = await workIdOf(input.work);
  if (!workId) return fail("That work is not available.");

  const limits = limitsFor(Date.now() - me.createdAt.getTime());
  const now = Date.now();
  const [last, recent10, recentDay, mine] = await Promise.all([
    prisma.comment.findFirst({ where: { memberId: me.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.comment.count({ where: { memberId: me.id, createdAt: { gt: new Date(now - 600_000) } } }),
    prisma.comment.count({ where: { memberId: me.id, createdAt: { gt: new Date(now - 86_400_000) } } }),
    prisma.comment.findMany({ where: { memberId: me.id, createdAt: { gt: new Date(now - 86_400_000) } }, select: { body: true }, take: 50 }),
  ]);
  if (last && now - last.createdAt.getTime() < limits.cooldownS * 1000) {
    const wait = Math.ceil(limits.cooldownS - (now - last.createdAt.getTime()) / 1000);
    return fail(`Please wait ${wait} second${wait === 1 ? "" : "s"} before posting again.`);
  }
  if (recent10 >= limits.per10min || recentDay >= limits.perDay) return fail(recentDay >= limits.perDay ? "That is all the comments you can post today. Come back tomorrow." : "You are posting very fast. Please wait a few minutes.");
  const fp = fingerprint(body.value);
  if (mine.some((c) => fingerprint(c.body) === fp)) return fail("You already posted that.");

  let parentId: string | null = null;
  if (typeof input.parentId === "string" && input.parentId) {
    const p = await prisma.comment.findUnique({ where: { id: input.parentId }, select: { id: true, workId: true, parentId: true, status: true } });
    if (!p || p.workId !== workId || p.status !== "VISIBLE") return fail("That comment is no longer there.");
    parentId = p.parentId ?? p.id; // a reply to a reply goes under the same top-level comment
  }
  const c = await prisma.comment.create({ data: { workId, memberId: me.id, parentId, body: body.value }, select: { id: true } });
  return { ok: true, id: c.id };
}

export async function editComment(me: Who, id: unknown, bodyRaw: unknown): Promise<Out> {
  const body = checkComment(bodyRaw);
  if (!body.ok) return fail(body.error);
  if (typeof id !== "string") return fail("That comment is no longer there.");
  const c = await prisma.comment.findUnique({ where: { id }, select: { memberId: true, status: true, body: true } });
  if (!c || c.memberId !== me.id) return fail("You can only edit your own comments.");
  if (c.status !== "VISIBLE") return fail("That comment can no longer be edited.");
  if (fingerprint(c.body) === fingerprint(body.value) && c.body === body.value) return { ok: true };
  await prisma.comment.update({ where: { id }, data: { body: body.value, edited: true } });
  return { ok: true };
}

/** A comment that has replies stays as "[deleted]" so the thread still reads; one without goes entirely. */
export async function deleteOwnComment(me: Who, id: unknown): Promise<Out> {
  if (typeof id !== "string") return { ok: true };
  const c = await prisma.comment.findUnique({ where: { id }, select: { memberId: true, _count: { select: { replies: true } } } });
  if (!c) return { ok: true };
  if (c.memberId !== me.id) return fail("You can only delete your own comments.");
  if (c._count.replies > 0) await prisma.comment.update({ where: { id }, data: { body: "", status: "REMOVED", memberId: null } });
  else await prisma.comment.delete({ where: { id } });
  return { ok: true };
}

/** Up-vote (1), down-vote (-1) or take the vote back (0). Not on your own comment. */
export async function voteComment(me: Who, id: unknown, value: unknown): Promise<Out<{ score: number; mine: number }>> {
  const v = typeof value === "number" ? value : Number(value);
  if (![-1, 0, 1].includes(v) || typeof id !== "string") return fail("That vote is not valid.");
  const c = await prisma.comment.findUnique({ where: { id }, select: { memberId: true, status: true } });
  if (!c || c.status !== "VISIBLE") return fail("That comment is no longer there.");
  if (c.memberId === me.id) return fail("You cannot vote on your own comment.");
  if ((await prisma.memberAttempt.count({ where: { kind: "vote", key: me.id, createdAt: { gt: new Date(Date.now() - 600_000) } } })) >= 80) return fail("You are voting very fast. Please slow down a little.");
  await noteAttempt("vote", me.id, true);
  const score = await prisma.$transaction(async (tx) => {
    const old = await tx.commentVote.findUnique({ where: { commentId_memberId: { commentId: id, memberId: me.id } }, select: { value: true } });
    const oldV = old?.value ?? 0;
    if (oldV !== v) {
      if (v === 0) await tx.commentVote.delete({ where: { commentId_memberId: { commentId: id, memberId: me.id } } });
      else await tx.commentVote.upsert({ where: { commentId_memberId: { commentId: id, memberId: me.id } }, create: { commentId: id, memberId: me.id, value: v }, update: { value: v } });
      await tx.comment.update({ where: { id }, data: { score: { increment: v - oldV } } });
    }
    return (await tx.comment.findUniqueOrThrow({ where: { id }, select: { score: true } })).score;
  }, { timeout: 20_000, maxWait: 10_000 });
  return { ok: true, score, mine: v };
}

export async function reportComment(me: Who, id: unknown, reason: unknown, details: unknown): Promise<Out> {
  if (typeof id !== "string" || !isReason(reason)) return fail("Pick a reason for the report.");
  const c = await prisma.comment.findUnique({ where: { id }, select: { memberId: true, status: true } });
  if (!c || c.status === "REMOVED") return fail("That comment is no longer there.");
  if (c.memberId === me.id) return fail("You cannot report your own comment. Delete it instead.");
  if ((await prisma.commentReport.count({ where: { memberId: me.id, createdAt: { gt: new Date(Date.now() - 86_400_000) } } })) >= 15) return fail("You have sent a lot of reports today. A moderator will get to them.");
  const text = typeof details === "string" ? details.trim().slice(0, 500) || null : null;
  try {
    await prisma.commentReport.create({ data: { commentId: id, memberId: me.id, reason, details: text } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: true }; // already reported by this member: said thanks the first time
    throw e;
  }
  // enough different members agree: take it out of sight until a moderator has looked
  const open = await prisma.commentReport.count({ where: { commentId: id, status: "OPEN" } });
  if (open >= AUTO_HIDE_REPORTS) await prisma.comment.updateMany({ where: { id, status: "VISIBLE" }, data: { status: "HIDDEN" } });
  return { ok: true };
}
