import { Prisma } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { purgeImages } from "@/lib/purge";

/* ───────────────────────────── normalisation ───────────────────────────── */

/**
 * Canonical form of a title for cross-source comparison: brackets (artist, event, "[English]",
 * "(Digital)") removed, accents stripped, punctuation collapsed. Keeps CJK letters.
 */
export function normTitle(raw: string): string {
  const stripped = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】|\{[^}]*\}|［[^］]*］|（[^）]*）/g, " ");
  const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return clean(stripped) || clean(raw);
}

const artistKey = (a: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Do two artist lists overlap? If either side is empty we cannot tell, so we do not veto. */
export function artistsCompatible(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return true;
  const set = new Set(a.map(artistKey));
  return b.some((x) => set.has(artistKey(x)));
}

/** Hamming distance between two hex dHashes (0 = identical). */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/* ───────────────────────────── matching ───────────────────────────── */

export interface Probe {
  titleNorm: string;
  language: string;
  kind: "ONESHOT" | "SERIES";
  /** 0 when not known yet */
  pageCount: number;
  artists: string[];
}

export interface Match {
  id: string;
  publicId: number;
  publish: string;
}

const PAGE_TOLERANCE = 2; // sources sometimes add or drop a credits page

/** A release we already hold under another source: same language, same normalised title, compatible artists and size. */
export async function findDuplicate(p: Probe): Promise<Match | null> {
  if (!p.titleNorm) return null;
  const rows = await db(() =>
    prisma.work.findMany({
      where: { language: p.language, titleNorm: p.titleNorm },
      select: { id: true, publicId: true, publish: true, kind: true, pageCount: true, tags: { where: { type: "ARTIST" }, select: { name: true } } },
      take: 10,
    }),
  );
  for (const r of rows) {
    if (r.kind !== p.kind) continue;
    if (!artistsCompatible(p.artists, r.tags.map((t) => t.name))) continue;
    if (p.kind === "ONESHOT" && r.kind === "ONESHOT" && p.pageCount > 0 && r.pageCount > 0 && Math.abs(p.pageCount - r.pageCount) > PAGE_TOLERANCE) continue;
    return { id: r.id, publicId: r.publicId, publish: r.publish };
  }
  return null;
}

/** Near-title matches that are not confident enough to merge on their own. */
export async function findSimilar(p: Probe, excludeId?: string): Promise<{ id: string; score: number }[]> {
  if (!p.titleNorm || p.titleNorm.length < 6) return [];
  const rows = await db(() =>
    prisma.$queryRaw<{ id: string; score: number }[]>(Prisma.sql`
      SELECT id, similarity("titleNorm", ${p.titleNorm})::float AS score
      FROM "Work"
      WHERE language = ${p.language}
        AND "titleNorm" % ${p.titleNorm}
        AND "titleNorm" <> ${p.titleNorm}
        AND similarity("titleNorm", ${p.titleNorm}) >= 0.8
        ${excludeId ? Prisma.sql`AND id <> ${excludeId}` : Prisma.empty}
        ${p.kind === "ONESHOT" && p.pageCount > 0 ? Prisma.sql`AND ("pageCount" = 0 OR abs("pageCount" - ${p.pageCount}) <= ${PAGE_TOLERANCE})` : Prisma.empty}
      ORDER BY score DESC
      LIMIT 3`),
  );
  return rows;
}

export async function recordCandidate(workId: string, otherId: string, score: number, reasons: string[]): Promise<void> {
  await db(() =>
    prisma.duplicateCandidate.upsert({
      where: { workId_otherId: { workId, otherId } },
      create: { workId, otherId, score, reasons },
      update: {},
    }),
  );
}

/** Attach another source to a Work we already have, so the same release is never stored twice. */
export async function attachSource(workId: string, site: string, externalId: string, url: string): Promise<void> {
  await db(() =>
    prisma.workSource.upsert({
      where: { site_externalId: { site, externalId } },
      create: { workId, site, externalId, url },
      update: {},
    }),
  );
}

/* ───────────────────────────── merging ───────────────────────────── */

/** Which of two works should survive: published beats draft beats rejected, then more pages, then older. */
export function pickSurvivor<T extends { publish: string; pageCount: number; createdAt: Date }>(a: T, b: T): [keep: T, drop: T] {
  const rank = (w: T) => (w.publish === "PUBLISHED" ? 2 : w.publish === "DRAFT" ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? [a, b] : [b, a];
  if (a.pageCount !== b.pageCount) return a.pageCount > b.pageCount ? [a, b] : [b, a];
  return a.createdAt <= b.createdAt ? [a, b] : [b, a];
}

/**
 * Fold `dropId` into `keepId`: sources, tags, counters and the translation group move across,
 * the loser's stored images are deleted, and the loser row is removed.
 */
export async function mergeWorks(keepId: string, dropId: string): Promise<{ purged: number }> {
  if (keepId === dropId) throw new Error("cannot merge a work into itself");
  const [keep, drop] = await Promise.all([
    prisma.work.findUniqueOrThrow({ where: { id: keepId } }),
    prisma.work.findUniqueOrThrow({ where: { id: dropId } }),
  ]);
  const tagIds = [...new Set([...keep.tagIds, ...drop.tagIds])];
  await prisma.$transaction([
    prisma.workSource.updateMany({ where: { workId: dropId }, data: { workId: keepId } }),
    prisma.work.update({
      where: { id: keepId },
      data: {
        tagIds,
        tags: { connect: tagIds.map((id) => ({ id })) },
        views: keep.views + drop.views,
        favorites: keep.favorites + drop.favorites,
        seedPopularity: Math.max(keep.seedPopularity, drop.seedPopularity),
        translationGroupId: keep.translationGroupId ?? drop.translationGroupId,
        altTitles: [...new Set([...keep.altTitles, ...drop.altTitles, ...(drop.title !== keep.title ? [drop.title] : [])])].slice(0, 20),
        description: keep.description ?? drop.description,
      },
    }),
    prisma.duplicateCandidate.updateMany({
      where: { OR: [{ workId: dropId }, { otherId: dropId }], status: "OPEN" },
      data: { status: "MERGED" },
    }),
  ]);
  const purged = await purgeImages(dropId, drop.coverKey);
  await prisma.work.delete({ where: { id: dropId } });
  return { purged };
}
