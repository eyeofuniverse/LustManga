import { prisma, db } from "@/lib/db";
import { pool } from "@/lib/http";
import { toWebp, UnsupportedImageError } from "@/lib/images";
import { r2Put } from "@/lib/r2";

export interface IngestStats {
  worksSeen: number;
  worksCreated: number;
  worksHeld: number;
  worksSuppressed: number;
  chaptersFetched: number;
  pagesStored: number;
  errors: string[];
}

export const emptyStats = (): IngestStats => ({
  worksSeen: 0,
  worksCreated: 0,
  worksHeld: 0,
  worksSuppressed: 0,
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
}

/**
 * Fetch every page of a chapter, normalise to WebP, upload to R2, and mark the chapter READY.
 * A chapter that comes up short is FAILED (and retried later), never published half-empty.
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
          const img = await toWebp(await ref.get());
          const key = `w/${work.mediaId}/${chapterId}/${ref.n}.webp`;
          await r2Put(key, img.data);
          return { order: ref.n, key, width: img.width, height: img.height, bytes: img.bytes, phash: img.phash };
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
      prisma.$transaction([
        prisma.page.deleteMany({ where: { chapterId } }),
        prisma.page.createMany({ data: pages.map((p) => ({ ...p, chapterId })) }),
        prisma.chapter.update({
          where: { id: chapterId },
          data: { status: "READY", pageCount: pages.length, publishedAt, error: null },
        }),
      ]),
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

/** Store a cover image (first page / cover art) at c/{mediaId}.webp and record the key. */
export async function storeCover(workId: string, mediaId: string, source: Buffer): Promise<string> {
  const img = await toWebp(source, { maxWidth: 600 });
  const key = `c/${mediaId}.webp`;
  await r2Put(key, img.data);
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
        chaptersFetched: stats.chaptersFetched,
        pagesStored: stats.pagesStored,
        errors: stats.errors.slice(0, 50),
      },
    }),
  );
}
