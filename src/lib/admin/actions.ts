"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import type { Prisma, SafetyTier, TagType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin, type AdminIdentity } from "@/lib/admin/auth";
import { purgeImages } from "@/lib/purge";
import { mergeWorks, pickSurvivor } from "@/lib/dedupe";
import { isCoreTerm } from "@/lib/safety/core";
import { classify } from "@/lib/safety/classify";
import { loadTerms } from "@/lib/safety/load-terms";
import { SAFETY_FIELDS, approveBatch, isQuarantined } from "@/lib/admin/approve";
import { mergeTagRecords, slug } from "@/lib/tags";
import { pingIndexNow } from "@/lib/indexnow";
import { workHref } from "@/lib/format";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

/** A work just went live: tell search engines once the response has been sent (never blocks or fails the action). */
function announce(publicId: number, slug: string) {
  after(() => pingIndexNow([workHref({ publicId, slug })]).then(() => undefined));
}

async function audit(me: AdminIdentity, action: string, targetType: string, targetId: string, diff?: object) {
  await prisma.auditLog
    .create({ data: { actorId: me.id, actorEmail: me.email, action, targetType, targetId, diff: diff as object | undefined } })
    .catch(() => {});
}

/* ───────────────────────────── review + works ───────────────────────────── */

/* ───────────── bulk approval ───────────── */

/** The most works one request approves: a transaction of this size stays well inside a server action's time limit. */
const BULK_MAX = 300;

export interface BulkResult {
  ok: boolean;
  message: string;
  /** works looked at (including any skipped), so a caller can show progress */
  scanned: number;
  approved: number;
  /** of the approved, how many went live now (the rest wait for the next ingest run to store their images) */
  live: number;
  /** left in the queue because they match a hard safety term */
  blocked: number;
  /** the last work looked at: pass it back to continue with the next batch */
  cursor: string | null;
  done: boolean;
}
const noBulk = (message: string): BulkResult => ({ ok: false, message, scanned: 0, approved: 0, live: 0, blocked: 0, cursor: null, done: true });

/**
 * After any action that changes what is published: the console's pages are re-read, and so are the dashboard's cached
 * aggregates (languages, sources, page totals), which would otherwise lag the live counts beside them for up to a minute.
 */
function refreshConsole() {
  revalidateTag("console-dashboard");
  revalidatePath("/console", "layout");
}

/** One transaction per batch: the decisions and their audit rows commit together or not at all. */
async function runBatch(me: AdminIdentity, where: Prisma.WorkWhereInput, take: number) {
  const terms = await loadTerms();
  const wentLive: string[] = [];
  const r = await prisma.$transaction((tx) => approveBatch(tx, me, where, take, terms, (paths) => wentLive.push(...paths)), { timeout: 30_000 });
  // search engines are told only once the transaction has committed: a rollback must never leave them told about works that are not live
  if (wentLive.length) after(() => pingIndexNow(wentLive).then(() => undefined));
  return r;
}

const summary = (r: { approved: number; live: number; blocked: number }) =>
  `Approved ${r.approved.toLocaleString()} work${r.approved === 1 ? "" : "s"}` +
  (r.approved ? ` (${r.live.toLocaleString()} published now${r.approved - r.live ? `, ${(r.approved - r.live).toLocaleString()} after the next ingest run` : ""})` : "") +
  (r.blocked ? `. ${r.blocked.toLocaleString()} left in the queue: they match a hard safety term` : "");

/** Approve the works with these public numbers (what ticking boxes on the review queue sends). */
export async function approveWorks(publicIds: number[]): Promise<BulkResult> {
  const me = await requireAdmin("MOD");
  const ids = [...new Set((Array.isArray(publicIds) ? publicIds : []).filter((n) => Number.isInteger(n) && n > 0 && n <= 2_147_483_647))];
  if (!ids.length) return noBulk("Nothing selected");
  if (ids.length > BULK_MAX) return noBulk(`Select at most ${BULK_MAX} works at a time`);
  const r = await runBatch(me, { publicId: { in: ids } }, ids.length);
  refreshConsole();
  const gone = ids.length - r.scanned; // already decided by someone else, or never in the queue
  return { ok: true, message: summary(r) + (gone ? `. ${gone} were no longer waiting for review` : ""), scanned: r.scanned, approved: r.approved, live: r.live, blocked: r.blocked, cursor: r.last, done: true };
}

/**
 * Approve the next batch of the whole Held tab ("approve everything"). The caller repeats it, passing back `cursor`, until
 * `done`: that keeps each request short and lets a person stop part-way. Only the Held tab, whose works have their images
 * stored so they could be looked at. Works carrying an explicit age marker (the "Review before download" tab) are never
 * approved by this, only by deliberately selecting them.
 */
export async function approveHeldBatch(cursor: string | null, limit = 200, asOf = ""): Promise<BulkResult> {
  // approving a whole queue is a bigger act than approving one work, so it is an administrator's, like every other bulk change here
  const me = await requireAdmin("ADMIN");
  const cutoff = new Date(asOf);
  if (Number.isNaN(cutoff.getTime())) return noBulk("Reload the page and try again");
  const take = Math.min(BULK_MAX, Math.max(1, Math.floor(Number(limit)) || 200));
  // only what existed when the page was loaded: the count the admin confirmed is the set that is approved, not whatever
  // the importers added while the run was going (the queue grows by hundreds a day)
  const r = await runBatch(me, { deferFetch: false, createdAt: { lte: cutoff }, ...(typeof cursor === "string" && cursor ? { id: { gt: cursor } } : {}) }, take);
  refreshConsole();
  return { ok: true, message: summary(r), scanned: r.scanned, approved: r.approved, live: r.live, blocked: r.blocked, cursor: r.last, done: r.scanned < take };
}

/** Admin decides a flagged work is a false positive. Publishes now if images exist, else once the next ingest run stores them. */
export async function approveWork(publicId: number): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  const w = await prisma.work.findUnique({ where: { publicId }, select: { id: true, slug: true, coverKey: true, pageCount: true, publish: true, title: true, ...SAFETY_FIELDS } });
  if (!w) return fail("Work not found");
  if (isQuarantined(w, await loadTerms())) return fail(`#${publicId} matches a hard safety term and cannot be approved. Reject it instead.`);
  const live = !!w.coverKey && w.pageCount > 0;
  await prisma.work.update({
    where: { id: w.id },
    data: {
      needsReview: false, reviewDecision: "APPROVED", reviewedAt: new Date(), reviewedBy: me.email,
      ...(live ? { publish: "PUBLISHED" as const } : {}),
    },
  });
  await audit(me, "work.approve", "work", String(publicId), { live });
  if (live) announce(publicId, w.slug);
  refreshConsole();
  return ok(live ? `#${publicId} approved and published` : `#${publicId} approved: images are fetched on the next ingest run, then it goes live`);
}

/** Admin confirms the flag. Rejects and deletes all stored images. */
export async function rejectWork(publicId: number): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  const w = await prisma.work.findUnique({ where: { publicId }, select: { id: true, coverKey: true } });
  if (!w) return fail("Work not found");
  const purged = await purgeImages(w.id, w.coverKey);
  await prisma.work.update({
    where: { id: w.id },
    data: { publish: "REJECTED", needsReview: false, reviewDecision: "REJECTED", reviewedAt: new Date(), reviewedBy: me.email, coverKey: null, pageCount: 0 },
  });
  await audit(me, "work.reject", "work", String(publicId), { purged });
  refreshConsole();
  return ok(`#${publicId} rejected, ${purged} stored image(s) deleted`);
}

export async function setWorkPublish(publicId: number, to: "PUBLISHED" | "DRAFT"): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  const w = await prisma.work.findUnique({ where: { publicId }, select: { id: true, slug: true, coverKey: true, pageCount: true, deferFetch: true, needsReview: true } });
  if (!w) return fail("Work not found");
  if (to === "PUBLISHED") {
    if (!w.coverKey || w.pageCount === 0) return fail("No images stored yet: approve it so the next ingest run fetches them");
    await prisma.work.update({
      where: { id: w.id },
      data: { publish: "PUBLISHED", needsReview: false, reviewDecision: "APPROVED", reviewedAt: new Date(), reviewedBy: me.email },
    });
  } else {
    // reviewDecision stops the ingest from auto-publishing it again
    await prisma.work.update({ where: { id: w.id }, data: { publish: "DRAFT", reviewDecision: "UNPUBLISHED", reviewedAt: new Date(), reviewedBy: me.email } });
  }
  await audit(me, `work.${to === "PUBLISHED" ? "publish" : "unpublish"}`, "work", String(publicId));
  if (to === "PUBLISHED") announce(publicId, w.slug);
  refreshConsole();
  return ok(`#${publicId} ${to === "PUBLISHED" ? "published" : "moved to draft"}`);
}

export async function deleteWork(publicId: number): Promise<ActionResult> {
  const me = await requireAdmin("ADMIN");
  const w = await prisma.work.findUnique({ where: { publicId }, select: { id: true, coverKey: true } });
  if (!w) return fail("Work not found");
  const purged = await purgeImages(w.id, w.coverKey);
  // the WorkSource row is kept via a REJECTED tombstone so discovery does not re-create it
  await prisma.work.update({
    where: { id: w.id },
    data: { publish: "REJECTED", needsReview: false, reviewDecision: "REJECTED", reviewedAt: new Date(), reviewedBy: me.email, coverKey: null, pageCount: 0 },
  });
  await audit(me, "work.delete", "work", String(publicId), { purged });
  refreshConsole();
  return ok(`#${publicId} removed, ${purged} stored image(s) deleted`);
}

export async function confirmSuppressed(id: string): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  await prisma.suppressedSource.update({ where: { id }, data: { confirmedAt: new Date() } });
  await audit(me, "suppressed.confirm", "suppressed", id);
  revalidatePath("/console/review");
  return ok("Confirmed");
}

export async function retryFailedChapters(): Promise<ActionResult> {
  const me = await requireAdmin("ADMIN");
  const r = await prisma.chapter.updateMany({ where: { status: "FAILED" }, data: { status: "QUEUED", attempts: 0, error: null } });
  await audit(me, "chapters.retry", "chapter", "failed", { count: r.count });
  revalidatePath("/console/runs");
  return ok(`${r.count} failed chapter(s) re-queued for the next ingest run`);
}

/* ───────────────────────────────── tags ──────────────────────────────────── */

export async function createTag(type: TagType, name: string): Promise<ActionResult> {
  const me = await requireAdmin("ADMIN");
  const n = name.trim();
  const s = slug(n);
  if (!n || !s) return fail("Enter a tag name");
  const tag = await prisma.tag.upsert({ where: { type_slug: { type, slug: s } }, create: { type, name: n, slug: s }, update: {}, select: { id: true } });
  await audit(me, "tag.create", "tag", String(tag.id), { type, name: n });
  revalidatePath("/console/tags");
  return ok(`Tag "${n}" ready`);
}

export async function renameTag(id: number, name: string): Promise<ActionResult> {
  const me = await requireAdmin("ADMIN");
  const n = name.trim();
  const s = slug(n);
  if (!n || !s) return fail("Enter a name");
  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) return fail("Tag not found");
  if (s !== tag.slug) {
    const clash = await prisma.tag.findUnique({ where: { type_slug: { type: tag.type, slug: s } } });
    if (clash) return fail(`"${clash.name}" already exists: use Merge instead`);
    // keep the old spelling resolving to this tag so future ingests do not recreate it
    await prisma.tagAlias.upsert({
      where: { type_slug: { type: tag.type, slug: tag.slug } },
      create: { type: tag.type, slug: tag.slug, name: tag.name, targetTagId: id },
      update: { targetTagId: id },
    });
  }
  await prisma.tag.update({ where: { id }, data: { name: n, slug: s } });
  await audit(me, "tag.rename", "tag", String(id), { from: tag.name, to: n });
  revalidatePath("/console/tags");
  return ok(`Renamed to "${n}"`);
}

export async function setTagFlag(id: number, flag: "hidden" | "featured", value: boolean): Promise<ActionResult> {
  const me = await requireAdmin("ADMIN");
  await prisma.tag.update({ where: { id }, data: { [flag]: value } });
  await audit(me, `tag.${flag}`, "tag", String(id), { value });
  revalidatePath("/console/tags");
  return ok(`${flag} ${value ? "on" : "off"}`);
}

/** Move every work from tag `fromId` onto `toId` and remove `fromId`; its name keeps resolving to the target. */
export async function mergeTags(fromId: number, toName: string): Promise<ActionResult> {
  const me = await requireAdmin("ADMIN");
  const from = await prisma.tag.findUnique({ where: { id: fromId } });
  if (!from) return fail("Tag not found");
  const s = slug(toName);
  const to = s ? await prisma.tag.findUnique({ where: { type_slug: { type: from.type, slug: s } } }) : null;
  if (!to) return fail(`No ${from.type.toLowerCase()} tag named "${toName}" (merge needs an existing tag of the same type)`);
  if (to.id === from.id) return fail("Cannot merge a tag into itself");

  await mergeTagRecords(from.id, to.id);
  await audit(me, "tag.merge", "tag", String(fromId), { from: from.name, into: to.name });
  revalidatePath("/console/tags");
  return ok(`Merged "${from.name}" into "${to.name}"`);
}

export async function deleteTag(id: number): Promise<ActionResult> {
  const me = await requireAdmin("ADMIN");
  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) return fail("Tag not found");
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Work" SET "tagIds" = array_remove("tagIds", ${id}) WHERE "tagIds" @> ARRAY[${id}]::int[]`,
    prisma.tag.delete({ where: { id } }), // implicit relation rows + aliases cascade
  ]);
  await audit(me, "tag.delete", "tag", String(id), { name: tag.name });
  revalidatePath("/console/tags");
  return ok(`Deleted "${tag.name}"`);
}

/* ─────────────────────────────── safety terms ────────────────────────────── */

const normTerm = (t: string) => t.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function addTerm(tier: SafetyTier, raw: string): Promise<ActionResult> {
  const me = await requireAdmin("ADMIN");
  const term = normTerm(raw);
  if (term.length < 2) return fail("Enter a term");
  if (tier !== "QUARANTINE" && isCoreTerm(term)) return fail(`"${term}" is a core hard term and is always quarantined`);
  await prisma.safetyTerm.upsert({
    where: { term_tier: { term, tier } },
    create: { term, tier, createdBy: me.email },
    update: {},
  });
  await loadTerms(true);
  await audit(me, "term.add", "term", term, { tier });
  revalidatePath("/console/tags");
  return ok(`"${term}" added to ${tier.toLowerCase()}`);
}

export async function removeTerm(id: string): Promise<ActionResult> {
  const me = await requireAdmin("ADMIN");
  const t = await prisma.safetyTerm.findUnique({ where: { id } });
  if (!t) return fail("Term not found");
  // the core hard terms are enforced from code; this guard also stops the table row from being edited away
  if (t.locked || (t.tier === "QUARANTINE" && isCoreTerm(t.term)))
    return fail(`"${t.term}" is a core hard term: it is enforced from code and cannot be removed`);
  await prisma.safetyTerm.delete({ where: { id } });
  await loadTerms(true);
  await audit(me, "term.remove", "term", t.term, { tier: t.tier });
  revalidatePath("/console/tags");
  return ok(`"${t.term}" removed from ${t.tier.toLowerCase()}`);
}

/* ───────────────────────────── duplicates ───────────────────────────── */

/**
 * Fold one work into the other. If either copy was rejected, the admin's rejection wins:
 * the other copy is rejected too instead of being merged into a live work.
 */
export async function resolveDuplicate(candidateId: string, keepPublicId: number): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  const cand = await prisma.duplicateCandidate.findUnique({ where: { id: candidateId } });
  if (!cand || cand.status !== "OPEN") return fail("Already resolved");
  const [a, b] = await Promise.all([
    prisma.work.findUnique({ where: { id: cand.workId } }),
    prisma.work.findUnique({ where: { id: cand.otherId } }),
  ]);
  if (!a || !b) {
    await prisma.duplicateCandidate.update({ where: { id: candidateId }, data: { status: "DISMISSED" } });
    return ok("One of the works no longer exists");
  }
  const keep = a.publicId === keepPublicId ? a : b.publicId === keepPublicId ? b : null;
  if (!keep) return fail("Pick one of the two works");
  const drop = keep.id === a.id ? b : a;

  if (a.publish === "REJECTED" || b.publish === "REJECTED") {
    const live = [a, b].find((w) => w.publish !== "REJECTED");
    if (live) {
      const purged = await purgeImages(live.id, live.coverKey);
      await prisma.work.update({
        where: { id: live.id },
        data: { publish: "REJECTED", needsReview: false, reviewDecision: "REJECTED", reviewedAt: new Date(), reviewedBy: me.email, coverKey: null, pageCount: 0 },
      });
      await prisma.duplicateCandidate.update({ where: { id: candidateId }, data: { status: "MERGED" } });
      await audit(me, "duplicate.reject-follow", "work", String(live.publicId), { purged });
      refreshConsole();
      return ok(`#${live.publicId} rejected to match the earlier rejection of its duplicate`);
    }
  }
  const { purged } = await mergeWorks(keep.id, drop.id);
  await prisma.duplicateCandidate.update({ where: { id: candidateId }, data: { status: "MERGED" } }).catch(() => {});
  await audit(me, "duplicate.merge", "work", String(keep.publicId), { dropped: drop.publicId, purged });
  refreshConsole();
  return ok(`#${drop.publicId} merged into #${keep.publicId}; its sources and tags moved across`);
}

export async function dismissDuplicate(candidateId: string): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  await prisma.duplicateCandidate.update({ where: { id: candidateId }, data: { status: "DISMISSED" } });
  await audit(me, "duplicate.dismiss", "duplicate", candidateId);
  refreshConsole();
  return ok("Marked as different works");
}

/* ───────────────────────────── visitor reports ───────────────────────────── */

export async function setReportStatus(id: string, status: "RESOLVED" | "DISMISSED" | "OPEN"): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  await prisma.report.update({ where: { id }, data: { status } });
  await audit(me, `report.${status.toLowerCase()}`, "report", id);
  refreshConsole();
  return ok(status === "OPEN" ? "Reopened" : status === "RESOLVED" ? "Marked resolved" : "Dismissed");
}
