import "server-only";
import type { Prisma, PublishStatus, TagType } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { cdn } from "@/lib/cdn";
import { pagesOf } from "@/lib/pages";
import type {
  AuditData, DuplicatesData, DupSide, ReportsData, ReviewData, ReviewTab, RunsData, TagsData, WorksData,
} from "@/lib/admin/types";

/** Data loaders for the console screens. Each returns plain data; the screens are pure views of it. */

const num = (v: string | undefined, d = 1) => Math.max(1, Number(v) || d);

/* ───────────────────────── review queue ───────────────────────── */

const REVIEW_PAGE = 12;

export async function loadReview(sp: { tab?: string; page?: string }): Promise<ReviewData> {
  const tab: ReviewTab = sp.tab === "deferred" || sp.tab === "quarantined" ? sp.tab : "held";
  const page = num(sp.page);
  const [held, deferred, quarantined] = await db(() =>
    Promise.all([
      prisma.work.count({ where: { needsReview: true, publish: "DRAFT", deferFetch: false } }),
      prisma.work.count({ where: { needsReview: true, publish: "DRAFT", deferFetch: true } }),
      prisma.suppressedSource.count(),
    ]),
  );
  const counts = { held, deferred, quarantined };
  const total = counts[tab];
  const base = { tab, page, pages: Math.max(1, Math.ceil(total / REVIEW_PAGE)), total, pageSize: REVIEW_PAGE, counts };

  if (tab === "quarantined") {
    const rows = await db(() => prisma.suppressedSource.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * REVIEW_PAGE, take: REVIEW_PAGE }));
    return { ...base, works: [], quarantined: rows.map((r) => ({ id: r.id, title: r.title, reasons: r.reasons, site: r.site, externalId: r.externalId, confirmedAt: r.confirmedAt, createdAt: r.createdAt })) };
  }

  const deferredTab = tab === "deferred";
  const works = await db(() =>
    prisma.work.findMany({
      where: { needsReview: true, publish: "DRAFT", deferFetch: deferredTab },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * REVIEW_PAGE,
      take: REVIEW_PAGE,
      include: { sources: { select: { url: true }, take: 1 }, tags: { select: { name: true }, take: 14 } },
    }),
  );
  const previews = deferredTab
    ? works.map(() => [] as string[])
    : await Promise.all(
        works.map(async (w) => {
          const ch = await prisma.chapter.findFirst({ where: { workId: w.id, status: "READY" }, orderBy: { number: "asc" }, select: { id: true, pageData: true } });
          return ch ? pagesOf(ch, w.mediaId).slice(0, 5).map((p) => cdn(p.key)!) : [];
        }),
      );
  return {
    ...base,
    quarantined: [],
    works: works.map((w, i) => ({
      id: w.id,
      publicId: w.publicId,
      language: w.language,
      title: w.title,
      reasons: w.safetyReasons,
      description: w.description,
      tags: w.tags.map((t) => t.name),
      pageCount: w.pageCount,
      coverUrl: cdn(w.coverKey),
      previews: previews[i],
      sourceUrl: w.sources[0]?.url ?? null,
      createdAt: w.createdAt,
    })),
  };
}

/* ───────────────────────── works ───────────────────────── */

const WORKS_PAGE = 30;
const STATES: PublishStatus[] = ["PUBLISHED", "DRAFT", "REJECTED"];

export async function loadWorks(sp: { q?: string; publish?: string; lang?: string; page?: string }): Promise<WorksData> {
  const page = num(sp.page);
  const q = (sp.q ?? "").trim();
  const publish = STATES.includes(sp.publish as PublishStatus) ? (sp.publish as PublishStatus) : undefined;
  const where: Prisma.WorkWhereInput = {
    ...(publish ? { publish } : {}),
    ...(sp.lang ? { language: sp.lang } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, ...(Number(q) ? [{ publicId: Number(q) }] : [])] } : {}),
  };
  const [rows, total, langs] = await db(() =>
    Promise.all([
      prisma.work.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * WORKS_PAGE, take: WORKS_PAGE }),
      prisma.work.count({ where }),
      prisma.work.groupBy({ by: ["language"], _count: true, orderBy: { _count: { language: "desc" } } }),
    ]),
  );
  return {
    rows: rows.map((w) => ({
      id: w.id, publicId: w.publicId, slug: w.slug, title: w.title, language: w.language, kind: w.kind, pageCount: w.pageCount,
      publish: w.publish, needsReview: w.needsReview, deferFetch: w.deferFetch, coverUrl: cdn(w.coverKey), createdAt: w.createdAt,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / WORKS_PAGE)),
    pageSize: WORKS_PAGE,
    q,
    publish: publish ?? "",
    lang: sp.lang ?? "",
    langs: langs.map((l) => ({ language: l.language, count: l._count })),
  };
}

/* ───────────────────────── reports ───────────────────────── */

export async function loadReports(sp: { status?: string }): Promise<ReportsData> {
  const status = sp.status === "closed" ? "closed" : "open";
  const [rows, open, closed] = await db(() =>
    Promise.all([
      prisma.report.findMany({
        where: status === "open" ? { status: "OPEN" } : { status: { not: "OPEN" } },
        // takedown requests first: they are time-sensitive
        orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.report.count({ where: { status: { not: "OPEN" } } }),
    ]),
  );
  return { status, rows: rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, details: r.details, contact: r.contact, workId: r.workId, createdAt: r.createdAt })), open, closed };
}

/* ───────────────────────── duplicates ───────────────────────── */

const loadSide = async (id: string): Promise<DupSide | null> => {
  const w = await prisma.work.findUnique({
    where: { id },
    include: { sources: { select: { site: true } }, tags: { where: { type: "ARTIST" }, select: { name: true }, take: 3 } },
  });
  return w
    ? {
        publicId: w.publicId, title: w.title, language: w.language, kind: w.kind, pageCount: w.pageCount, publish: w.publish,
        coverUrl: cdn(w.coverKey), sources: [...new Set(w.sources.map((s) => s.site))], artists: w.tags.map((t) => t.name),
      }
    : null;
};

export async function loadDuplicates(): Promise<DuplicatesData> {
  const [cands, open, merged] = await db(() =>
    Promise.all([
      prisma.duplicateCandidate.findMany({ where: { status: "OPEN" }, orderBy: { score: "desc" }, take: 30 }),
      prisma.duplicateCandidate.count({ where: { status: "OPEN" } }),
      prisma.duplicateCandidate.count({ where: { status: "MERGED" } }),
    ]),
  );
  const pairs = (await Promise.all(cands.map(async (c) => ({ id: c.id, score: c.score, reasons: c.reasons, a: await loadSide(c.workId), b: await loadSide(c.otherId) })))).filter(
    (p): p is { id: string; score: number; reasons: string[]; a: DupSide; b: DupSide } => !!p.a && !!p.b,
  );
  return { pairs, open, merged };
}

/* ───────────────────────── tags and safety terms ───────────────────────── */

const TAGS_PAGE = 40;
const TAG_TYPES: TagType[] = ["TAG", "ARTIST", "GROUP", "PARODY", "CHARACTER", "LANGUAGE", "CATEGORY"];
export const TAG_TYPE_LIST = TAG_TYPES.map((t) => t.toLowerCase());

export async function loadTags(sp: { q?: string; type?: string; sort?: string; flag?: string; page?: string; view?: string }): Promise<TagsData> {
  const page = num(sp.page);
  const type = TAG_TYPES.includes(sp.type as TagType) ? (sp.type as TagType) : undefined;
  const q = (sp.q ?? "").trim();
  // a link that carries a tag filter (the command palette, a bookmark) lands on the tag list
  const view = sp.view === "tags" || sp.q || sp.type || sp.sort || sp.flag || sp.page ? "tags" : "terms";
  const where: Prisma.TagWhereInput = {
    ...(type ? { type } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(sp.flag === "hidden" ? { hidden: true } : sp.flag === "featured" ? { featured: true } : {}),
  };
  const orderBy: Prisma.TagOrderByWithRelationInput = sp.sort === "name" ? { name: "asc" } : sp.sort === "new" ? { id: "desc" } : { count: "desc" };

  const [tags, total, terms, workReasons, suppressedReasons] = await db(() =>
    Promise.all([
      view === "tags" ? prisma.tag.findMany({ where, orderBy, skip: (page - 1) * TAGS_PAGE, take: TAGS_PAGE, include: { _count: { select: { aliases: true } } } }) : Promise.resolve([]),
      prisma.tag.count({ where }),
      prisma.safetyTerm.findMany({ orderBy: [{ tier: "asc" }, { term: "asc" }] }),
      prisma.$queryRaw<{ r: string; n: number }[]>`SELECT r, count(*)::int AS n FROM "Work", unnest("safetyReasons") AS r GROUP BY r`,
      prisma.$queryRaw<{ r: string; n: number }[]>`SELECT r, count(*)::int AS n FROM "SuppressedSource", unnest(reasons) AS r GROUP BY r`,
    ]),
  );
  // how many works each term has caught (reasons look like "tag:school uniform")
  const caught = new Map<string, number>();
  for (const { r, n } of [...workReasons, ...suppressedReasons]) {
    const term = r.slice(r.indexOf(":") + 1);
    caught.set(term, (caught.get(term) ?? 0) + n);
  }
  return {
    view,
    terms: terms.map((t) => ({ id: t.id, term: t.term, tier: t.tier, locked: t.locked, caught: caught.get(t.term) ?? 0 })),
    tags: tags.map((t) => ({ id: t.id, name: t.name, type: t.type, count: t.count, hidden: t.hidden, featured: t.featured, aliases: t._count.aliases })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / TAGS_PAGE)),
    pageSize: TAGS_PAGE,
    q,
    type: type ?? "",
    sort: sp.sort ?? "count",
    flag: sp.flag ?? "",
  };
}

/* ───────────────────────── ingest runs ───────────────────────── */

export async function loadRuns(): Promise<RunsData> {
  const [runs, failed, failedCount] = await db(() =>
    Promise.all([
      prisma.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
      prisma.chapter.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { id: true, number: true, error: true, attempts: true, work: { select: { publicId: true, title: true, language: true } } },
      }),
      prisma.chapter.count({ where: { status: "FAILED" } }),
    ]),
  );
  return {
    runs: runs.map((r) => ({
      id: r.id, site: r.site, mode: r.mode, startedAt: r.startedAt, finishedAt: r.finishedAt, ok: r.ok, seen: r.worksSeen, created: r.worksCreated,
      held: r.worksHeld, quarantined: r.worksSuppressed, chapters: r.chaptersFetched, pages: r.pagesStored, errors: r.errors,
    })),
    failed: failed.map((c) => ({ id: c.id, number: c.number, attempts: c.attempts, error: c.error, publicId: c.work.publicId, title: c.work.title, language: c.work.language })),
    failedCount,
  };
}

/* ───────────────────────── audit log ───────────────────────── */

export async function loadAudit(sp: { q?: string }): Promise<AuditData> {
  const q = (sp.q ?? "").trim();
  const rows = await db(() =>
    prisma.auditLog.findMany({
      where: q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { actorEmail: { contains: q, mode: "insensitive" } }, { targetId: { contains: q } }] } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
  return {
    rows: rows.map((r) => ({ id: r.id, at: r.createdAt, actor: r.actorEmail, action: r.action, targetType: r.targetType, targetId: r.targetId, diff: r.diff })),
    q,
    actors: [...new Set(rows.map((r) => r.actorEmail).filter((a): a is string => !!a))],
  };
}
