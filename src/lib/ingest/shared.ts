import { createHash } from "node:crypto";
import { purgeImages } from "@/lib/purge";
import { pagesOf } from "@/lib/pages";
import { prisma, db } from "@/lib/db";
import { pool } from "@/lib/http";
import { isAvifSequence, toWebp, UnsupportedImageError } from "@/lib/images";
import { pageKey, type PageTuple } from "@/lib/pages";
import { r2Put } from "@/lib/r2";

export interface IngestStats {
  worksSeen: number;
  worksCreated: number;
  worksHeld: number;
  worksSuppressed: number;
  /** releases that matched a work we already hold; the source was attached instead of re-downloading */
  duplicates: number;
  chaptersFetched: number;
  pagesStored: number;
  errors: string[];
}

export const emptyStats = (): IngestStats => ({
  worksSeen: 0,
  worksCreated: 0,
  worksHeld: 0,
  worksSuppressed: 0,
  duplicates: 0,
  chaptersFetched: 0,
  pagesStored: 0,
  errors: [],
});

/** a chapter that failed this many times is parked until an admin resets it */
export const MAX_ATTEMPTS = 6;
/** consecutive chapter failures before a run stops itself */
const BREAKER = 8;

/** Run budget: wall clock, number of works, and a circuit breaker for runs where the source is failing. */
export class Budget {
  private deadline: number;
  failures = 0;
  tripped = false;
  constructor(
    minutes: number,
    public worksLeft: number,
  ) {
    this.deadline = Date.now() + minutes * 60_000;
  }
  get expired() {
    return this.tripped || Date.now() > this.deadline || this.worksLeft <= 0;
  }
  ok() {
    this.failures = 0;
  }
  fail(log: (m: string) => void) {
    if (++this.failures >= BREAKER && !this.tripped) {
      this.tripped = true;
      log(`  circuit breaker: ${BREAKER} chapters failed in a row - stopping this run (source or network problem)`);
    }
  }
}

export interface PageSource {
  /** 1-based reading order */
  n: number;
  get: () => Promise<Buffer>;
  /** dimensions known from the source's metadata; used when a file has to be stored untouched */
  dims?: { width: number; height: number };
}

/**
 * Fetch every page of a chapter, normalise to WebP, upload to R2, and mark the chapter READY.
 * Per-page data is written to the chapter as compact tuples (no row per page). Animated AVIF, which
 * cannot be re-encoded, is stored untouched. A chapter that comes up short is FAILED (and retried
 * later), never published half-empty.
 */
export async function storeChapterPages(
  work: { id: string; mediaId: string },
  chapterId: string,
  loadPages: () => Promise<PageSource[]>,
  expected: number,
  publishedAt: Date | null,
  stats: IngestStats,
  budget: Budget,
  log: (m: string) => void,
  concurrency = 12,
): Promise<void> {
  await db(() => prisma.chapter.update({ where: { id: chapterId }, data: { status: "FETCHING", error: null } }));
  try {
    const refs = await loadPages();
    const pages = await pool(refs, concurrency, async (ref) => {
      let lastErr: unknown;
      for (let i = 0; i < 3; i++) {
        try {
          const raw = await ref.get();
          try {
            const img = await toWebp(raw);
            await r2Put(pageKey(work.mediaId, chapterId, ref.n), img.data);
            return { tuple: [img.width, img.height, img.bytes] as PageTuple, phash: img.phash as string | null };
          } catch (e) {
            if (e instanceof UnsupportedImageError && isAvifSequence(raw)) {
              await r2Put(pageKey(work.mediaId, chapterId, ref.n, "avif"), raw, "image/avif");
              return { tuple: [ref.dims?.width ?? 0, ref.dims?.height ?? 0, raw.length, "avif"] as PageTuple, phash: null as string | null };
            }
            throw e;
          }
        } catch (e) {
          if (e instanceof UnsupportedImageError) throw e; // permanent: do not retry
          lastErr = e;
        }
      }
      throw lastErr;
    });
    if (pages.length === 0) throw new Error("no pages");
    if (pages.length < Math.min(expected, refs.length)) throw new Error(`short chapter: ${pages.length}/${expected} pages`);
    await db(() =>
      prisma.chapter.update({
        where: { id: chapterId },
        data: {
          status: "READY",
          pageCount: pages.length,
          pageData: pages.map((p) => p.tuple) as unknown as number[][],
          bytes: pages.reduce((a, p) => a + p.tuple[2], 0),
          phash: pages.find((p) => p.phash)?.phash ?? null,
          publishedAt,
          error: null,
        },
      }),
    );
    stats.chaptersFetched++;
    stats.pagesStored += pages.length;
    budget.ok();
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    const permanent = e instanceof UnsupportedImageError;
    await db(() =>
      prisma.chapter.update({
        where: { id: chapterId },
        // permanent failures are parked at once; an admin can still reset them from Ingest runs
        data: { status: "FAILED", error: permanent ? `unsupported: ${msg}` : msg, attempts: permanent ? MAX_ATTEMPTS : { increment: 1 } },
      }),
    );
    if (!permanent) budget.fail(log); // a file we cannot convert says nothing about the source being down
    throw e;
  }
}

/**
 * Store a cover: the 600px version at c/{mediaId}.webp (work page, hero) and a 280px card thumbnail at
 * c/{mediaId}-s.webp (lists). Cards are the bulk of the traffic, and the small one is about a fifth the size.
 */
export async function writeCovers(mediaId: string, source: Buffer): Promise<string> {
  const [big, small] = await Promise.all([toWebp(source, { maxWidth: 600 }), toWebp(source, { maxWidth: 280 })]);
  await Promise.all([r2Put(`c/${mediaId}.webp`, big.data), r2Put(`c/${mediaId}-s.webp`, small.data)]);
  return `c/${mediaId}.webp`;
}

export async function storeCover(workId: string, mediaId: string, source: Buffer): Promise<string> {
  const key = await writeCovers(mediaId, source);
  await db(() => prisma.work.update({ where: { id: workId }, data: { coverKey: key } }));
  return key;
}

/**
 * Roll chapter results up into the work (page total) and auto-publish it when it is clean:
 * at least one READY chapter, a cover, no review hold, and not previously unpublished by an admin.
 */
export async function finalizeWork(workId: string, sourceId: string): Promise<{ published: boolean; held: boolean; ready: number }> {
  const ready = await db(() =>
    prisma.chapter.aggregate({ where: { workId, status: "READY" }, _count: true, _sum: { pageCount: true } }),
  );
  const fresh = await db(() =>
    prisma.work.findUniqueOrThrow({
      where: { id: workId },
      select: { coverKey: true, publish: true, needsReview: true, reviewedAt: true, reviewDecision: true },
    }),
  );
  // a cover that failed once (or never existed) must not leave the work a draft forever: use its first page
  if (!fresh.coverKey && ready._count > 0) {
    const key = await coverFromFirstPage(workId).catch(() => null);
    if (key) fresh.coverKey = key;
  }
  const canAutoPublish =
    ready._count > 0 &&
    !!fresh.coverKey &&
    !fresh.needsReview &&
    (!fresh.reviewedAt || fresh.reviewDecision === "APPROVED") &&
    fresh.publish === "DRAFT";
  await db(() =>
    prisma.work.update({
      where: { id: workId },
      data: {
        pageCount: ready._sum.pageCount ?? 0,
        ...(canAutoPublish ? { publish: "PUBLISHED" as const, autoPublishedAt: new Date() } : {}),
      },
    }),
  );
  await db(() => prisma.workSource.update({ where: { id: sourceId }, data: { lastFetchedAt: new Date() } }));
  return { published: canAutoPublish, held: fresh.needsReview, ready: ready._count };
}

export async function beginRun(site: string, mode: string, dryRun: boolean): Promise<string | null> {
  if (dryRun) return null;
  const run = await db(() => prisma.ingestRun.create({ data: { site, mode }, select: { id: true } }));
  // a killed run can leave chapters stuck in FETCHING; put them back in the queue
  await db(() =>
    prisma.chapter.updateMany({
      where: { status: "FETCHING", updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } },
      data: { status: "QUEUED" },
    }),
  );
  return run.id;
}

export async function endRun(runId: string | null, stats: IngestStats): Promise<void> {
  if (!runId) return;
  await db(() =>
    prisma.ingestRun.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        ok: stats.errors.length === 0,
        worksSeen: stats.worksSeen,
        worksCreated: stats.worksCreated,
        worksHeld: stats.worksHeld,
        worksSuppressed: stats.worksSuppressed,
        duplicates: stats.duplicates,
        chaptersFetched: stats.chaptersFetched,
        pagesStored: stats.pagesStored,
        errors: stats.errors.slice(0, 50),
      },
    }),
  );
}

/** Short stable hash for logs and error strings: lets us correlate a failure without printing a work's id or title. */
export const anon = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 8);

/** Build the cover from the first page that can be decoded (animated AVIF pages are skipped). */
export async function coverFromFirstPage(workId: string): Promise<string | null> {
  const host = process.env.NEXT_PUBLIC_IMG_CDN_HOST;
  if (!host) return null;
  const work = await db(() => prisma.work.findUnique({ where: { id: workId }, select: { mediaId: true } }));
  const chapter = await db(() =>
    prisma.chapter.findFirst({ where: { workId, status: "READY" }, orderBy: { number: "asc" }, select: { id: true, pageData: true } }),
  );
  if (!work || !chapter) return null;
  for (const p of pagesOf(chapter, work.mediaId).slice(0, 5)) {
    if (p.key.endsWith(".avif")) continue;
    const res = await fetch(`https://${host}/${p.key}`, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!res?.ok) continue;
    try {
      return await storeCover(workId, work.mediaId, Buffer.from(await res.arrayBuffer()));
    } catch {
      /* try the next page */
    }
  }
  return null;
}

/**
 * Persist a resume cursor, but never move it backwards. Two runs can overlap (a manual run during a
 * scheduled sweep) and the slower one must not rewind the faster one's progress.
 */
export async function saveCursor(
  key: string,
  value: Record<string, unknown>,
  isNewer: (current: Record<string, unknown>, next: Record<string, unknown>) => boolean,
): Promise<void> {
  const row = await db(() => prisma.setting.findUnique({ where: { key } }));
  const cur = (row?.value ?? null) as Record<string, unknown> | null;
  if (cur && !isNewer(cur, value)) return;
  await db(() => prisma.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } }));
}
export const offsetNewer = (c: Record<string, unknown>, n: Record<string, unknown>) => Number(n.offset ?? 0) > Number(c.offset ?? 0);
export const pageNewer = (c: Record<string, unknown>, n: Record<string, unknown>) => Number(n.page ?? 1) > Number(c.page ?? 1);

/**
 * A work we already hold turned out to carry a hard tag (the source changed its tags, or an admin added a
 * term). Take it down for good: delete its images, record each of its sources as quarantined metadata, and
 * remove the work so nothing can republish it.
 */
export async function takeDownWork(workId: string, reasons: string[]): Promise<boolean> {
  const work = await db(() => prisma.work.findUnique({ where: { id: workId }, include: { sources: true } }));
  if (!work) return false;
  await purgeImages(workId, work.coverKey);
  for (const src of work.sources) {
    // MangaDex quarantine is recorded per manga (the id before the language suffix)
    const externalId = src.site === "mangadex" ? src.externalId.split(":")[0] : src.externalId;
    await db(() =>
      prisma.suppressedSource.upsert({
        where: { site_externalId: { site: src.site, externalId } },
        create: { site: src.site, externalId, title: work.title.slice(0, 200), reasons },
        update: { reasons },
      }),
    );
  }
  await db(() => prisma.duplicateCandidate.deleteMany({ where: { OR: [{ workId }, { otherId: workId }] } }));
  await db(() => prisma.work.delete({ where: { id: workId } })); // cascades chapters and sources
  return true;
}

/**
 * Popularity seeds arrive on incompatible scales (MangaDex follows, Hentai2Read views, list rank elsewhere).
 * Map raw counts onto the common 0..50000 scale the "Popular" ordering uses, logarithmically so a handful of
 * huge numbers does not flatten everything else.
 */
export const scaleSeed = (raw: number, max: number): number =>
  Math.min(50_000, Math.round((50_000 * Math.log1p(Math.max(0, raw))) / Math.log1p(max)));
