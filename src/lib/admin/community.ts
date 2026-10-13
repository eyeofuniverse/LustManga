import "server-only";
import { Prisma } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { guardConsole } from "@/lib/admin/guard";

/** Data for the console's Community screen: comments that need a look, the latest comments, and the members. */
export type CommunityTab = "reported" | "recent" | "members";

export interface CommentRow {
  id: string;
  body: string;
  status: "VISIBLE" | "HIDDEN" | "REMOVED";
  createdAt: Date;
  score: number;
  replyCount: number;
  work: { publicId: number; slug: string; title: string };
  author: { id: string; handle: string; displayName: string; banned: boolean } | null;
  /** open reports on it, newest first */
  reports: { reason: string; details: string | null; by: string | null; createdAt: Date }[];
}

export interface MemberRow {
  id: string;
  handle: string;
  displayName: string;
  email: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  banned: boolean;
  bannedReason: string | null;
  comments: number;
  ratings: number;
}

export interface CommunityData {
  tab: CommunityTab;
  q: string;
  page: number;
  pages: number;
  counts: { reported: number; members: number };
  comments: CommentRow[];
  members: MemberRow[];
  canBan: boolean;
}

const PAGE = 20;

export async function loadCommunity(sp: { tab?: string; q?: string; page?: string }): Promise<CommunityData> {
  const me = await guardConsole();
  const tab: CommunityTab = sp.tab === "recent" || sp.tab === "members" ? sp.tab : "reported";
  const q = (sp.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number(sp.page) || 1);

  const reportedIds = async () => (await prisma.commentReport.findMany({ where: { status: "OPEN" }, distinct: ["commentId"], select: { commentId: true } })).map((r) => r.commentId);
  const [openIds, members] = await db(() => Promise.all([reportedIds(), prisma.member.count()]));
  const reportedWhere: Prisma.CommentWhereInput = { OR: [{ id: { in: openIds } }, { status: "HIDDEN" }] };

  let comments: CommentRow[] = [];
  let total = 0;
  let memberRows: MemberRow[] = [];
  if (tab === "members") {
    const where: Prisma.MemberWhereInput = q ? { OR: [{ handle: { contains: q.toLowerCase() } }, ...(me.role === "MOD" ? [] : [{ email: { contains: q.toLowerCase() } }])] } : {};
    const [rows, n] = await db(() =>
      Promise.all([
        prisma.member.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE,
          take: PAGE,
          select: { id: true, handle: true, displayName: true, email: true, createdAt: true, lastLoginAt: true, banned: true, bannedReason: true, _count: { select: { comments: true, ratings: true } } },
        }),
        prisma.member.count({ where }),
      ]),
    );
    total = n;
    // an email address is private: only admins see it (and search by it)
    memberRows = rows.map((m) => ({ id: m.id, handle: m.handle, displayName: m.displayName, email: me.role === "MOD" ? null : m.email, createdAt: m.createdAt, lastLoginAt: m.lastLoginAt, banned: m.banned, bannedReason: m.bannedReason, comments: m._count.comments, ratings: m._count.ratings }));
  } else {
    const where: Prisma.CommentWhereInput = tab === "reported" ? reportedWhere : q ? { body: { contains: q, mode: "insensitive" } } : {};
    const [rows, n] = await db(() =>
      Promise.all([
        prisma.comment.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * PAGE,
          take: PAGE,
          select: {
            id: true,
            body: true,
            status: true,
            createdAt: true,
            score: true,
            work: { select: { publicId: true, slug: true, title: true } },
            member: { select: { id: true, handle: true, displayName: true, banned: true } },
            reports: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, select: { reason: true, details: true, createdAt: true, member: { select: { handle: true } } } },
            _count: { select: { replies: true } },
          },
        }),
        prisma.comment.count({ where }),
      ]),
    );
    total = n;
    comments = rows.map((c) => ({
      id: c.id,
      body: c.body,
      status: c.status,
      createdAt: c.createdAt,
      score: c.score,
      replyCount: c._count.replies,
      work: c.work,
      author: c.member,
      reports: c.reports.map((r) => ({ reason: r.reason, details: r.details, by: r.member?.handle ?? null, createdAt: r.createdAt })),
    }));
  }
  return { tab, q, page, pages: Math.max(1, Math.ceil(total / PAGE)), counts: { reported: openIds.length, members }, comments, members: memberRows, canBan: me.role !== "MOD" };
}
