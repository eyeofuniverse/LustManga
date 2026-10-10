import "server-only";
import { prisma, db } from "@/lib/db";
import { dayBuckets } from "@/lib/admin/format";

export interface RunRow {
  id: string;
  site: string;
  mode: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean;
  errorCount: number;
  worksCreated: number;
  chaptersFetched: number;
  pagesStored: number;
}

export interface DashboardData {
  works: { published: number; draft: number; rejected: number; series: number };
  chapters: { ready: number; queued: number; failed: number };
  pages: number;
  bytes: number;
  quarantined: number;
  attention: { review: number; reports: number; duplicates: number; failedChapters: number };
  growth: { day: string; n: number }[];
  runs: RunRow[];
  languages: { label: string; value: number }[];
  sources: { label: string; value: number }[];
  topTags: { name: string; type: string; count: number }[];
}

/** Everything the dashboard shows, in one round of queries. */
export async function loadDashboard(): Promise<DashboardData> {
  const [byPublish, series, chapters, pages, runs, langs, topTags, suppressed, held, reports, dups, sources, growth] = await db(() =>
    Promise.all([
      prisma.work.groupBy({ by: ["publish"], _count: true }),
      prisma.work.count({ where: { kind: "SERIES", publish: "PUBLISHED" } }),
      prisma.chapter.groupBy({ by: ["status"], _count: true }),
      prisma.chapter.aggregate({ where: { status: "READY" }, _sum: { pageCount: true, bytes: true } }),
      prisma.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: 7 }),
      prisma.work.groupBy({ by: ["language"], where: { publish: "PUBLISHED" }, _count: true, orderBy: { _count: { language: "desc" } }, take: 8 }),
      prisma.tag.findMany({ where: { hidden: false }, orderBy: { count: "desc" }, take: 14, select: { name: true, type: true, count: true } }),
      prisma.suppressedSource.count(),
      prisma.work.count({ where: { needsReview: true, publish: "DRAFT" } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.duplicateCandidate.count({ where: { status: "OPEN" } }),
      prisma.$queryRaw<{ site: string; n: number }[]>`SELECT s.site, count(DISTINCT s."workId")::int AS n FROM "WorkSource" s JOIN "Work" w ON w.id = s."workId" WHERE w.publish = 'PUBLISHED' GROUP BY 1 ORDER BY n DESC`,
      prisma.$queryRaw<{ day: string; n: number }[]>`SELECT to_char("createdAt" AT TIME ZONE 'utc', 'YYYY-MM-DD') AS day, count(*)::int AS n FROM "Work" WHERE "createdAt" > now() - interval '15 days' GROUP BY 1`,
    ]),
  );
  const w = (k: string) => byPublish.find((r) => r.publish === k)?._count ?? 0;
  const c = (k: string) => chapters.find((r) => r.status === k)?._count ?? 0;
  return {
    works: { published: w("PUBLISHED"), draft: w("DRAFT"), rejected: w("REJECTED"), series },
    chapters: { ready: c("READY"), queued: c("QUEUED"), failed: c("FAILED") },
    pages: pages._sum.pageCount ?? 0,
    bytes: Number(pages._sum.bytes ?? 0),
    quarantined: suppressed,
    attention: { review: held, reports, duplicates: dups, failedChapters: c("FAILED") },
    growth: dayBuckets(growth, 14),
    runs: runs.map((r) => ({
      id: r.id,
      site: r.site,
      mode: r.mode,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      ok: r.ok,
      errorCount: r.errors.length,
      worksCreated: r.worksCreated,
      chaptersFetched: r.chaptersFetched,
      pagesStored: r.pagesStored,
    })),
    languages: langs.map((l) => ({ label: l.language, value: l._count })),
    sources: sources.map((s) => ({ label: s.site, value: s.n })),
    topTags: topTags.map((t) => ({ name: t.name, type: t.type, count: t.count })),
  };
}
