import "server-only";
import { prisma, db } from "@/lib/db";

/** What the page needs to show a comment thread: plain data, safe to hand to a client component. */
export interface CommentDto {
  id: string;
  /** empty for a removed or deleted comment that stays only because of the replies under it */
  body: string;
  createdAt: string;
  edited: boolean;
  score: number;
  status: "VISIBLE" | "HIDDEN" | "REMOVED";
  author: { handle: string; displayName: string } | null;
  mine: boolean;
  /** 1, -1 or 0 */
  myVote: number;
  replies: CommentDto[];
}

export type CommentSort = "new" | "top";
export const COMMENT_PAGE = 10;
const MAX_REPLIES = 300;

const authorSel = { select: { handle: true, displayName: true } } as const;

interface Row {
  id: string;
  body: string;
  createdAt: Date;
  edited: boolean;
  score: number;
  status: "VISIBLE" | "HIDDEN" | "REMOVED";
  memberId: string | null;
  member: { handle: string; displayName: string } | null;
}

const toDto = (r: Row, meId: string | null, votes: Map<string, number>): CommentDto => ({
  id: r.id,
  // a hidden comment is shown to its own author only; everyone else sees a gap that keeps the replies in place
  body: r.status === "VISIBLE" || (r.status === "HIDDEN" && !!meId && r.memberId === meId) ? r.body : "",
  createdAt: r.createdAt.toISOString(),
  edited: r.edited,
  score: r.score,
  status: r.status,
  author: r.status === "REMOVED" ? null : r.member,
  mine: !!meId && r.memberId === meId,
  myVote: votes.get(r.id) ?? 0,
  replies: [],
});

/** One page of a work's comments (top-level ones, with all their replies) and how many there are in all. */
export async function loadThread(workId: string, meId: string | null, opts: { sort: CommentSort; page: number }): Promise<{ items: CommentDto[]; total: number; topLevel: number }> {
  const page = Math.max(1, Math.floor(opts.page) || 1);
  // a top-level comment shows when it is visible, or when it carries visible replies, or when it is the reader own
  const topWhere = {
    workId,
    parentId: null,
    OR: [{ status: "VISIBLE" as const }, { replies: { some: { status: "VISIBLE" as const } } }, ...(meId ? [{ memberId: meId }] : [])],
  };
  const [top, total, topLevel] = await db(() =>
    Promise.all([
      prisma.comment.findMany({
        where: topWhere,
        orderBy: opts.sort === "top" ? [{ score: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }],
        skip: (page - 1) * COMMENT_PAGE,
        take: COMMENT_PAGE,
        select: { id: true, body: true, createdAt: true, edited: true, score: true, status: true, memberId: true, member: authorSel },
      }),
      prisma.comment.count({ where: { workId, status: "VISIBLE" } }),
      prisma.comment.count({ where: topWhere }),
    ]),
  );
  const ids = top.map((c) => c.id);
  const replies = ids.length
    ? await db(() =>
        prisma.comment.findMany({
          where: { parentId: { in: ids }, OR: [{ status: "VISIBLE" }, ...(meId ? [{ memberId: meId }] : [])] },
          orderBy: { createdAt: "asc" },
          take: MAX_REPLIES,
          select: { id: true, parentId: true, body: true, createdAt: true, edited: true, score: true, status: true, memberId: true, member: authorSel },
        }),
      )
    : [];
  const votes = new Map<string, number>();
  if (meId) {
    const all = [...ids, ...replies.map((r) => r.id)];
    for (const v of await db(() => prisma.commentVote.findMany({ where: { memberId: meId, commentId: { in: all } }, select: { commentId: true, value: true } }))) votes.set(v.commentId, v.value);
  }
  const items = top.map((c) => toDto(c, meId, votes));
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const r of replies) byId.get(r.parentId!)?.replies.push(toDto(r, meId, votes));
  return { items, total, topLevel };
}

/** The member own rating of a work, 0 when none. */
export async function myRating(meId: string | null, workId: string): Promise<number> {
  if (!meId) return 0;
  const r = await db(() => prisma.workRating.findUnique({ where: { memberId_workId: { memberId: meId, workId } }, select: { value: true } }));
  return r?.value ?? 0;
}

/* ───────────── profiles ───────────── */

export interface ProfileData {
  handle: string;
  displayName: string;
  bio: string | null;
  joined: Date;
  banned: boolean;
  commentCount: number;
  ratingCount: number;
  showRatings: boolean;
  comments: { id: string; body: string; createdAt: Date; score: number; work: { publicId: number; slug: string; title: string } }[];
  ratings: { value: number; updatedAt: Date; work: { publicId: number; slug: string; title: string; coverKey: string | null } }[];
}

export async function loadProfile(handle: string): Promise<ProfileData | null> {
  const m = await db(() => prisma.member.findUnique({ where: { handle: handle.toLowerCase() }, select: { id: true, handle: true, displayName: true, bio: true, createdAt: true, banned: true, showRatings: true } }));
  if (!m) return null;
  const workSel = { select: { publicId: true, slug: true, title: true, publish: true } } as const;
  const [commentCount, ratingCount, comments, ratings] = await db(() =>
    Promise.all([
      prisma.comment.count({ where: { memberId: m.id, status: "VISIBLE" } }),
      prisma.workRating.count({ where: { memberId: m.id } }),
      m.banned ? Promise.resolve([]) : prisma.comment.findMany({ where: { memberId: m.id, status: "VISIBLE", work: { publish: "PUBLISHED" } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, body: true, createdAt: true, score: true, work: workSel } }),
      m.showRatings && !m.banned ? prisma.workRating.findMany({ where: { memberId: m.id, work: { publish: "PUBLISHED" } }, orderBy: { updatedAt: "desc" }, take: 30, select: { value: true, updatedAt: true, work: { select: { publicId: true, slug: true, title: true, coverKey: true } } } }) : Promise.resolve([]),
    ]),
  );
  return {
    handle: m.handle,
    displayName: m.displayName,
    bio: m.bio,
    joined: m.createdAt,
    banned: m.banned,
    commentCount,
    ratingCount,
    showRatings: m.showRatings,
    comments: comments.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, score: c.score, work: { publicId: c.work.publicId, slug: c.work.slug, title: c.work.title } })),
    ratings,
  };
}

/** A member own activity, for the account page: their ratings and comments, newest first. */
export async function loadActivity(meId: string) {
  const [ratings, comments] = await db(() =>
    Promise.all([
      prisma.workRating.findMany({ where: { memberId: meId, work: { publish: "PUBLISHED" } }, orderBy: { updatedAt: "desc" }, take: 50, select: { value: true, updatedAt: true, work: { select: { publicId: true, slug: true, title: true } } } }),
      prisma.comment.findMany({ where: { memberId: meId, status: { not: "REMOVED" } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, body: true, status: true, createdAt: true, work: { select: { publicId: true, slug: true, title: true } } } }),
    ]),
  );
  return { ratings, comments };
}
