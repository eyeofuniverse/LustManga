"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, type AdminIdentity } from "@/lib/admin/auth";

/**
 * What moderators do to comments and members. Moderators (and above) can hide, restore and remove comments; banning a member
 * is for admins. Every change writes an audit row, and a comment keeps its text when it is taken down (the audit trail is
 * only useful if the words are still there).
 */
type Result = { ok: true; message: string } | { ok: false; message: string };
const ok = (message: string): Result => ({ ok: true, message });
const fail = (message: string): Result => ({ ok: false, message });

async function audit(me: AdminIdentity, action: string, targetType: string, targetId: string, diff?: object) {
  await prisma.auditLog.create({ data: { actorId: me.id, actorEmail: me.email, action, targetType, targetId, diff: diff as object | undefined } }).catch(() => {});
}
const refresh = () => {
  revalidatePath("/console", "layout");
  revalidatePath("/g/[ref]", "page");
};

/** hide / restore / remove one comment; its open reports are settled the same way */
export async function setCommentStatus(id: string, status: "VISIBLE" | "HIDDEN" | "REMOVED"): Promise<Result> {
  const me = await requireAdmin("MOD");
  const c = await prisma.comment.findUnique({ where: { id }, select: { status: true, memberId: true } });
  if (!c) return fail("That comment no longer exists.");
  await prisma.$transaction([
    prisma.comment.update({ where: { id }, data: { status } }),
    prisma.commentReport.updateMany({ where: { commentId: id, status: "OPEN" }, data: { status: status === "VISIBLE" ? "DISMISSED" : "RESOLVED" } }),
  ]);
  await audit(me, `comment.${status === "VISIBLE" ? "restore" : status === "HIDDEN" ? "hide" : "remove"}`, "comment", id, { from: c.status, to: status, author: c.memberId });
  refresh();
  return ok(status === "VISIBLE" ? "Comment restored" : status === "HIDDEN" ? "Comment hidden" : "Comment removed");
}

/** the reports were wrong: close them, leave the comment as it is */
export async function dismissCommentReports(id: string): Promise<Result> {
  const me = await requireAdmin("MOD");
  const r = await prisma.commentReport.updateMany({ where: { commentId: id, status: "OPEN" }, data: { status: "DISMISSED" } });
  await audit(me, "comment.dismiss-reports", "comment", id, { reports: r.count });
  refresh();
  return ok(`Dismissed ${r.count} report${r.count === 1 ? "" : "s"}`);
}

/** Ban: the member can still read and sign in, but cannot comment or rate, and every visible comment of theirs is hidden. */
export async function banMember(fd: FormData): Promise<Result> {
  const me = await requireAdmin("ADMIN");
  const id = String(fd.get("id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 200);
  const m = await prisma.member.findUnique({ where: { id }, select: { handle: true, banned: true } });
  if (!m) return fail("That member no longer exists.");
  if (m.banned) return ok("Already banned");
  const hidden = await prisma.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: { banned: true, bannedReason: reason || null, bannedAt: new Date() } });
    const r = await tx.comment.updateMany({ where: { memberId: id, status: "VISIBLE" }, data: { status: "HIDDEN" } });
    return r.count;
  }, { timeout: 20_000, maxWait: 10_000 });
  await audit(me, "member.ban", "member", id, { handle: m.handle, reason: reason || null, commentsHidden: hidden });
  refresh();
  return ok(`Banned ${m.handle}; ${hidden} comment${hidden === 1 ? "" : "s"} hidden`);
}

/** Lift a ban. Their hidden comments stay hidden until someone restores them one by one. */
export async function unbanMember(id: string): Promise<Result> {
  const me = await requireAdmin("ADMIN");
  const m = await prisma.member.findUnique({ where: { id }, select: { handle: true, banned: true } });
  if (!m) return fail("That member no longer exists.");
  if (!m.banned) return ok("Not banned");
  await prisma.member.update({ where: { id }, data: { banned: false, bannedReason: null, bannedAt: null } });
  await audit(me, "member.unban", "member", id, { handle: m.handle });
  refresh();
  return ok(`Unbanned ${m.handle}`);
}
