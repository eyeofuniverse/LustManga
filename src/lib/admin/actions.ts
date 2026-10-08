"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { SafetyTier, TagType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin, type AdminIdentity } from "@/lib/admin/auth";
import { purgeImages } from "@/lib/purge";
import { mergeWorks, pickSurvivor } from "@/lib/dedupe";
import { isCoreTerm } from "@/lib/safety/core";
import { loadTerms } from "@/lib/safety/load-terms";
import { slug } from "@/lib/tags";
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

/** Admin decides a flagged work is a false positive. Publishes now if images exist, else once the next ingest run stores them. */
export async function approveWork(publicId: number): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  const w = await prisma.work.findUnique({ where: { publicId }, select: { id: true, slug: true, coverKey: true, pageCount: true, publish: true, title: true } });
  if (!w) return fail("Work not found");
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
  revalidatePath("/console", "layout");
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
  revalidatePath("/console", "layout");
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
  revalidatePath("/console", "layout");
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
  revalidatePath("/console", "layout");
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

  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Work" SET "tagIds" = (SELECT array_agg(DISTINCT x) FROM unnest(array_replace("tagIds", ${from.id}, ${to.id})) AS x) WHERE "tagIds" @> ARRAY[${from.id}]::int[]`,
    prisma.$executeRaw`INSERT INTO "_WorkTags" ("A","B") SELECT ${to.id}, "B" FROM "_WorkTags" WHERE "A" = ${from.id} ON CONFLICT DO NOTHING`,
    prisma.$executeRaw`DELETE FROM "_WorkTags" WHERE "A" = ${from.id}`,
    prisma.tagAlias.updateMany({ where: { targetTagId: from.id }, data: { targetTagId: to.id } }),
    prisma.tagAlias.upsert({
      where: { type_slug: { type: from.type, slug: from.slug } },
      create: { type: from.type, slug: from.slug, name: from.name, targetTagId: to.id },
      update: { targetTagId: to.id },
    }),
    prisma.tag.delete({ where: { id: from.id } }),
  ]);
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
      revalidatePath("/console", "layout");
      return ok(`#${live.publicId} rejected to match the earlier rejection of its duplicate`);
    }
  }
  const { purged } = await mergeWorks(keep.id, drop.id);
  await prisma.duplicateCandidate.update({ where: { id: candidateId }, data: { status: "MERGED" } }).catch(() => {});
  await audit(me, "duplicate.merge", "work", String(keep.publicId), { dropped: drop.publicId, purged });
  revalidatePath("/console", "layout");
  return ok(`#${drop.publicId} merged into #${keep.publicId}; its sources and tags moved across`);
}

export async function dismissDuplicate(candidateId: string): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  await prisma.duplicateCandidate.update({ where: { id: candidateId }, data: { status: "DISMISSED" } });
  await audit(me, "duplicate.dismiss", "duplicate", candidateId);
  revalidatePath("/console", "layout");
  return ok("Marked as different works");
}

/* ───────────────────────────── visitor reports ───────────────────────────── */

export async function setReportStatus(id: string, status: "RESOLVED" | "DISMISSED" | "OPEN"): Promise<ActionResult> {
  const me = await requireAdmin("MOD");
  await prisma.report.update({ where: { id }, data: { status } });
  await audit(me, `report.${status.toLowerCase()}`, "report", id);
  revalidatePath("/console", "layout");
  return ok(status === "OPEN" ? "Reopened" : status === "RESOLVED" ? "Marked resolved" : "Dismissed");
}
