"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Banned, NotSignedIn, endAllSessions, endSession, getMember, hashKey, requestIp, requireMember, startSession } from "./session";
import { changePassword, deleteAccount, regenerateCodes, resetWithCode, signIn, signUp, updateProfile } from "./auth-core";
import { deleteOwnComment, editComment, postComment, rateWork, reportComment, voteComment } from "./community-core";
import { loadThread, type CommentDto, type CommentSort } from "./community-queries";
import { safeNext } from "./next";

/**
 * Everything a member can do, as server actions. Each one answers with plain data the page turns into a message: it never
 * throws at the visitor. Next checks that the request comes from this site, and every action that changes something checks
 * the session itself.
 */
type Fail = { ok: false; message: string; signIn?: boolean };
const WENT_WRONG: Fail = { ok: false, message: "Something went wrong. Please try again in a moment." };

async function guard<T>(fn: (me: Awaited<ReturnType<typeof requireMember>>) => Promise<T>): Promise<T | Fail> {
  try {
    return await fn(await requireMember());
  } catch (e) {
    if (e instanceof NotSignedIn) return { ok: false, message: "Sign in to do that.", signIn: true };
    if (e instanceof Banned) return { ok: false, message: "This account cannot post. If you think that is a mistake, use the report form." };
    console.error("member action failed", e);
    return WENT_WRONG;
  }
}
const ipKey = async () => hashKey(await requestIp());

/* ───────────── sign up / in / out ───────────── */

export async function signUpAction(input: { username: string; password: string; email?: string; next?: string; website?: string }) {
  try {
    // a hidden field a person never sees: a script that fills every field fills this one too
    if (input.website) return { ok: false as const, message: "Something went wrong. Please try again." };
    const r = await signUp({ username: input.username, password: input.password, email: input.email, ipKey: await ipKey() });
    if (!r.ok) return r;
    await startSession(r.memberId);
    return { ok: true as const, codes: r.codes, next: safeNext(input.next, "/account") };
  } catch (e) {
    console.error("sign up failed", e);
    return WENT_WRONG;
  }
}

export async function signInAction(input: { username: string; password: string; next?: string }) {
  try {
    const r = await signIn({ username: input.username, password: input.password, ipKey: await ipKey() });
    if (!r.ok) return r;
    await startSession(r.memberId);
    return { ok: true as const, next: safeNext(input.next, "/") };
  } catch (e) {
    console.error("sign in failed", e);
    return WENT_WRONG;
  }
}

export async function signOutAction() {
  await endSession().catch(() => {});
  return { ok: true as const };
}

export async function resetPasswordAction(input: { username: string; code: string; password: string }) {
  try {
    const r = await resetWithCode({ username: input.username, code: input.code, password: input.password, ipKey: await ipKey() });
    if (!r.ok) return r;
    await endAllSessions(r.memberId); // whoever had the old password is signed out
    await startSession(r.memberId);
    return { ok: true as const, codesLeft: r.codesLeft };
  } catch (e) {
    console.error("reset failed", e);
    return WENT_WRONG;
  }
}

/* ───────────── the account ───────────── */

export const updateProfileAction = async (input: { displayName: string; bio: string; email: string; showRatings: boolean }) =>
  guard(async (me) => {
    const r = await updateProfile(me.id, input);
    if (r.ok) revalidatePath("/account");
    return r;
  });

export const changePasswordAction = async (input: { current: string; next: string }) =>
  guard(async (me) => {
    const r = await changePassword(me.id, me.handle, { ...input, ipKey: await ipKey() });
    if (r.ok) await endAllSessions(me.id, { keepCurrent: true });
    return r;
  });

export const regenerateCodesAction = async (input: { password: string }) => guard((me) => regenerateCodes(me.id, me.handle, input.password));

export async function deleteAccountAction(input: { password: string }) {
  const me = await getMember();
  if (!me) return { ok: false as const, message: "Sign in to do that.", signIn: true };
  try {
    const r = await deleteAccount(me.id, me.handle, input.password);
    if (r.ok) await endSession();
    return r;
  } catch (e) {
    console.error("delete account failed", e);
    return WENT_WRONG;
  }
}

/* ───────────── ratings and comments ───────────── */

export const rateWorkAction = async (input: { work: number; value: number }) => guard((me) => rateWork(me, input.work, input.value));

export const postCommentAction = async (input: { work: number; body: string; parentId?: string }) =>
  guard(async (me) => {
    const r = await postComment(me, input);
    if (r.ok) revalidatePath("/g/[ref]", "page");
    return r;
  });

export const editCommentAction = async (input: { id: string; body: string }) => guard((me) => editComment(me, input.id, input.body));
export const deleteCommentAction = async (input: { id: string }) => guard((me) => deleteOwnComment(me, input.id));
export const voteCommentAction = async (input: { id: string; value: number }) => guard((me) => voteComment(me, input.id, input.value));
export const reportCommentAction = async (input: { id: string; reason: string; details?: string }) => guard((me) => reportComment(me, input.id, input.reason, input.details));

/** More of a work's comments, for the "show more" button. Open to everyone (comments are public). */
export async function moreCommentsAction(input: { work: number; sort: CommentSort; page: number }): Promise<{ ok: true; items: CommentDto[]; topLevel: number } | Fail> {
  try {
    const w = await prisma.work.findFirst({ where: { publicId: Number(input.work), publish: "PUBLISHED" }, select: { id: true } });
    if (!w) return { ok: false, message: "That work is not available." };
    const me = await getMember();
    const t = await loadThread(w.id, me?.id ?? null, { sort: input.sort === "top" ? "top" : "new", page: Math.min(200, Math.max(1, Math.floor(Number(input.page)) || 1)) });
    return { ok: true, items: t.items, topLevel: t.topLevel };
  } catch (e) {
    console.error("load comments failed", e);
    return WENT_WRONG;
  }
}
