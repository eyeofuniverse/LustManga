import type { Prisma } from "@prisma/client";
import { classify } from "@/lib/safety/classify";
import type { TermSet } from "@/lib/safety/classify";
import { workHref } from "@/lib/format";

/**
 * The core of mass approval, kept apart from the server actions so it can be tested (a "use server" file may only export
 * actions, and this must never be callable from a browser: it trusts the identity it is given).
 */

/** the fields the safety classifier reads, wherever the work's wording ended up (see src/lib/titles.ts) */
export const SAFETY_FIELDS = {
  titleOriginal: true,
  titleNorm: true,
  altTitles: true,
  description: true,
  tags: { where: { type: "TAG" as const }, select: { name: true } },
} satisfies Prisma.WorkSelect;

export type SafetyWork = { title: string; titleOriginal: string | null; titleNorm: string | null; altTitles: string[]; description: string | null; tags: { name: string }[] };

/** Would the classifier quarantine this work right now? */
export const isQuarantined = (w: SafetyWork, terms: TermSet): boolean =>
  classify(
    { title: w.title, altTitles: [...w.altTitles, w.titleOriginal, w.titleNorm].filter((x): x is string => !!x), description: w.description, tags: w.tags.map((t) => t.name) },
    terms,
  ).verdict === "QUARANTINE";

export const isLive = (w: { coverKey: string | null; pageCount: number }) => !!w.coverKey && w.pageCount > 0;

export interface BatchOutcome {
  /** works looked at, including any left in the queue */
  scanned: number;
  approved: number;
  live: number;
  /** left in the queue because they match an admin quarantine term */
  blocked: number;
  /** the last work looked at, to continue from */
  last: string | null;
}

/**
 * Approve the works in the review queue that match `where`, up to `take`, exactly as approving one does: the decision is
 * recorded, a work that already has images goes live, and each gets its own audit row. Only works that really are waiting
 * (a draft with needsReview) are touched, and any that match an admin quarantine term stay where they are.
 * `db` is a transaction client, so all of it commits together or not at all. `notify` receives the paths that just went live.
 */
export async function approveBatch(
  db: Prisma.TransactionClient,
  me: { id: string; email: string },
  where: Prisma.WorkWhereInput,
  take: number,
  terms: TermSet,
  notify: (paths: string[]) => void,
): Promise<BatchOutcome> {
  const rows = await db.work.findMany({
    where: { AND: [{ needsReview: true, publish: "DRAFT" }, where] },
    orderBy: { id: "asc" },
    take,
    select: { id: true, publicId: true, slug: true, title: true, coverKey: true, pageCount: true, ...SAFETY_FIELDS },
  });
  const fine = rows.filter((w) => !isQuarantined(w, terms));
  const live = fine.filter(isLive);
  const waiting = fine.filter((w) => !isLive(w));
  const decided = { needsReview: false, reviewDecision: "APPROVED", reviewedAt: new Date(), reviewedBy: me.email };
  if (live.length) await db.work.updateMany({ where: { id: { in: live.map((w) => w.id) } }, data: { ...decided, publish: "PUBLISHED" as const } });
  if (waiting.length) await db.work.updateMany({ where: { id: { in: waiting.map((w) => w.id) } }, data: decided });
  if (fine.length) {
    await db.auditLog.createMany({
      data: fine.map((w) => ({ actorId: me.id, actorEmail: me.email, action: "work.approve", targetType: "work", targetId: String(w.publicId), diff: { live: isLive(w), bulk: true } })),
    });
  }
  if (live.length) notify(live.map((w) => workHref(w)));
  return { scanned: rows.length, approved: fine.length, live: live.length, blocked: rows.length - fine.length, last: rows.at(-1)?.id ?? null };
}
