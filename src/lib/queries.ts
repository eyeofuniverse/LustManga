import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { Prisma, type TagType } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { PAGE_SIZE } from "@/lib/site";
import { normText, type NumCond, type Term } from "@/lib/search";
import { slug as makeSlug } from "@/lib/tags";
import type { Prefs } from "@/lib/prefs";
import { OWN_TRAFFIC_CAP } from "@/lib/signals";
import type { Sort } from "@/lib/sorts";
import type { SuggestResult, TagLite, WorkCard } from "@/lib/types";

/* ───────────────────────────── helpers ───────────────────────────── */

/** a rating counts for the Top rated list once this many people have voted */
const MIN_VOTES = 10;
/** the rating pulled toward the typical 7/10 until many people have voted (the same formula as bayesianRating in lib/signals.ts) */
const BAYES = Prisma.sql`((w."srcVotes"::float8 * w."srcRating" + 25 * 7) / (w."srcVotes" + 25))`;
/**
 * The "Popular" ordering: the source sites' score plus what readers here add, at most OWN_TRAFFIC_CAP. The cap keeps
 * the anonymous counters (cookie-based, easy to script) from lifting a work above ones the source sites rate far higher.
 * This exact expression is indexed (see scripts/db-setup.mts), so the cap is written out as a literal.
 */
const OWN = Prisma.raw(`LEAST(w.views * 20 + w.favorites * 50, ${OWN_TRAFFIC_CAP})`);
const POP = Prisma.sql`(w."seedPopularity" + ${OWN})`;
const CARD = Prisma.sql`w."publicId", w.slug, w.title, w.language, w.category::text AS category, w.kind::text AS kind, w."pageCount", w."coverKey", w."createdAt"`;

const TYPE_BY_SLUG: Record<string, TagType> = {
  tag: "TAG", artist: "ARTIST", group: "GROUP", parody: "PARODY", character: "CHARACTER", language: "LANGUAGE", category: "CATEGORY",
};
export const tagTypeOf = (slug: string): TagType | null => TYPE_BY_SLUG[slug] ?? null;

const OPS: Record<string, Prisma.Sql> = {
  ">": Prisma.sql`>`, "<": Prisma.sql`<`, ">=": Prisma.sql`>=`, "<=": Prisma.sql`<=`, "=": Prisma.sql`=`,
};

/** Cache a query for a short time, keyed on its arguments. Dates come back as ISO strings. */
function cached<A extends unknown[], R>(name: string, seconds: number, fn: (...a: A) => Promise<R>) {
  return (...args: A) => unstable_cache(() => fn(...args), [name, JSON.stringify(args)], { revalidate: seconds })();
}

/* ───────────────────────────── listing ───────────────────────────── */

/** how many daily view buckets of OUR OWN readers each windowed sort adds on top of the source momentum (today's bucket counts) */
const WINDOW_DAYS: Partial<Record<Sort, number>> = { trending: 2, week: 7, month: 30 };
/** the momentum column each windowed sort reads: the source's chart position or growth (see lib/signals.ts) */
const TREND_COLUMN: Partial<Record<Sort, Prisma.Sql>> = { trending: Prisma.sql`w."trendDay"`, week: Prisma.sql`w."trendWeek"`, month: Prisma.sql`w."trendMonth"` };

export interface ListOpts {
  sort?: Sort;
  langs?: string[];
  /** works that carry ALL of these tags */
  include?: number[];
  /** works that carry ANY of these tags (a "following" feed) */
  anyTags?: number[];
  exclude?: number[];
  categories?: string[];
  text?: string[];
  excludeText?: string[];
  pages?: NumCond[];
  /** age in days */
  uploaded?: NumCond[];
  excludeId?: number;
  page?: number;
  pageSize?: number;
}

function where(o: ListOpts): Prisma.Sql {
  const c: Prisma.Sql[] = [Prisma.sql`w.publish = 'PUBLISHED'`, Prisma.sql`w."coverKey" IS NOT NULL`, Prisma.sql`w."pageCount" > 0`];
  if (o.sort === "rated") c.push(Prisma.sql`w."srcRating" IS NOT NULL AND w."srcVotes" >= ${MIN_VOTES}`);
  if (o.langs?.length) c.push(Prisma.sql`w.language = ANY(${o.langs}::text[])`);
  if (o.include?.length) c.push(Prisma.sql`w."tagIds" @> ${o.include}::int[]`);
  if (o.anyTags?.length) c.push(Prisma.sql`w."tagIds" && ${o.anyTags}::int[]`);
  if (o.exclude?.length) c.push(Prisma.sql`NOT (w."tagIds" && ${o.exclude}::int[])`);
  if (o.categories?.length) c.push(Prisma.sql`w.category::text = ANY(${o.categories}::text[])`);
  for (const t of o.text ?? []) {
    const n = normText(t);
    if (n) c.push(Prisma.sql`w."titleNorm" ILIKE ${"%" + n.replace(/[%_\\]/g, "\\$&") + "%"}`);
  }
  for (const t of o.excludeText ?? []) {
    const n = normText(t);
    if (n) c.push(Prisma.sql`w."titleNorm" NOT ILIKE ${"%" + n.replace(/[%_\\]/g, "\\$&") + "%"}`);
  }
  for (const p of o.pages ?? []) c.push(Prisma.sql`w."pageCount" ${OPS[p.op]} ${p.n}`);
  for (const u of o.uploaded ?? []) {
    // "age < 7d" means created AFTER now-7d, so the comparison flips
    const flip: Record<string, string> = { "<": ">", ">": "<", "<=": ">=", ">=": "<=", "=": "=" };
    c.push(Prisma.sql`w."createdAt" ${OPS[flip[u.op]]} now() - make_interval(days => ${u.n}::int)`);
  }
  if (o.excludeId) c.push(Prisma.sql`w."publicId" <> ${o.excludeId}`);
  return Prisma.join(c, " AND ");
}

export async function listWorks(o: ListOpts): Promise<{ items: WorkCard[]; hasNext: boolean }> {
  const size = o.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, o.page ?? 1);
  const days = o.sort ? WINDOW_DAYS[o.sort] : undefined;
  // windowed sorts rank by views in the last N days, with the all-time order breaking ties (and ordering a quiet window)
  const join = days
    ? Prisma.sql`LEFT JOIN (SELECT "workId", sum(views)::int AS v FROM "WorkViewDay" WHERE day > (now() AT TIME ZONE 'utc')::date - ${days}::int GROUP BY 1) wv ON wv."workId" = w.id`
    : Prisma.empty;
  const trend = o.sort ? TREND_COLUMN[o.sort] : undefined;
  // a work the source charts do not mention at all takes a quarter of its all-time popularity (TREND_FALLBACK_DIVISOR in
  // lib/signals.ts), so a work that is climbing a chart beats it, and among themselves they keep the all-time order.
  // Our own readers' views in the window are added on top, so real traffic matters more as it arrives.
  const order =
    o.sort === "new"
      ? Prisma.sql`w."createdAt" DESC, w.id DESC`
      : o.sort === "saved"
        ? Prisma.sql`w.favorites DESC, ${POP} DESC, w.id DESC`
        : o.sort === "rated"
          ? Prisma.sql`${BAYES} DESC, ${POP} DESC, w.id DESC`
          : trend
            ? Prisma.sql`(CASE WHEN ${trend} > 0 THEN ${trend} ELSE w."seedPopularity" / 4 END + LEAST(coalesce(wv.v, 0) * 20, ${OWN_TRAFFIC_CAP}::int)) DESC, ${POP} DESC, w.id DESC`
            : Prisma.sql`${POP} DESC, w.id DESC`;
  const rows = await db(() =>
    prisma.$queryRaw<WorkCard[]>(Prisma.sql`
      SELECT ${CARD} FROM "Work" w ${join} WHERE ${where(o)}
      ORDER BY ${order} LIMIT ${size + 1} OFFSET ${(page - 1) * size}`),
  );
  return { items: rows.slice(0, size), hasNext: rows.length > size };
}

export interface UpdateCard extends WorkCard {
  chapterNumber: number;
  chapterAt: Date | string;
}

/**
 * Series ordered by their newest chapter, one row per series: the "Latest updates" page. A chapter's date is when it
 * was published upstream (so a backlog fetch does not make 25 old chapters look brand new), else when we stored it.
 */
export async function listUpdates(o: Pick<ListOpts, "langs" | "exclude" | "page" | "pageSize">): Promise<{ items: UpdateCard[]; hasNext: boolean }> {
  const size = o.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, o.page ?? 1);
  const rows = await db(() =>
    prisma.$queryRaw<UpdateCard[]>(Prisma.sql`
      SELECT ${CARD}, u.number AS "chapterNumber", u.at AS "chapterAt"
      FROM (
        SELECT DISTINCT ON (c."workId") c."workId", c.number, coalesce(c."publishedAt", c."createdAt") AS at
        FROM "Chapter" c WHERE c.status = 'READY'
        ORDER BY c."workId", coalesce(c."publishedAt", c."createdAt") DESC, c.number DESC
      ) u
      JOIN "Work" w ON w.id = u."workId"
      WHERE ${where({ langs: o.langs, exclude: o.exclude })} AND w.kind = 'SERIES'
      ORDER BY u.at DESC, w.id DESC LIMIT ${size + 1} OFFSET ${(page - 1) * size}`),
  );
  return { items: rows.slice(0, size), hasNext: rows.length > size };
}

/**
 * "More by this artist / circle": other works that share the work's first artist and first circle, most popular
 * first. Skips a tag that only this work carries.
 */
export async function getMoreBy(
  work: { publicId: number; byType: Record<string, { id: number; name: string; slug: string; type: string; count: number }[]> },
  prefs: Prefs,
  take = 12,
): Promise<{ tag: { id: number; name: string; slug: string; type: string }; items: WorkCard[] }[]> {
  const f = prefFilters(prefs);
  const picks = [work.byType.ARTIST?.[0], work.byType.GROUP?.[0]].filter((t): t is NonNullable<typeof t> => !!t && t.count > 1);
  const rows = await Promise.all(picks.map((tag) => listWorks({ ...f, include: [tag.id], excludeId: work.publicId, sort: "popular", pageSize: take })));
  return picks.map((tag, i) => ({ tag, items: rows[i].items })).filter((r) => r.items.length > 0);
}

/** Count, capped so a huge unfiltered list never becomes a full-table count. */
export async function countWorks(o: ListOpts, cap = 10_000): Promise<{ n: number; capped: boolean }> {
  const rows = await db(() =>
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM (SELECT 1 FROM "Work" w WHERE ${where(o)} LIMIT ${cap + 1}) t`),
  );
  const n = rows[0]?.n ?? 0;
  return { n: Math.min(n, cap), capped: n > cap };
}

/** Prefs -> the filters every public list applies. */
export const prefFilters = (p: Prefs): Pick<ListOpts, "langs" | "exclude"> => ({
  langs: p.langs.length ? p.langs : undefined,
  exclude: p.hide.length ? p.hide.map((h) => h.id) : undefined,
});

/* ───────────────────────────── tags ───────────────────────────── */

const tagCols = { id: true, type: true, name: true, slug: true, count: true } as const;
/** getTag also needs to know whether the tag is hidden, so its pages can 404 */
const tagColsWithHidden = { ...tagCols, hidden: true } as const;

/** Find a tag by type and slug (or by an old/merged spelling). Returns the canonical tag. */
export const getTag = cache(async (type: TagType, slugOrName: string): Promise<TagLite | null> => {
  const s = makeSlug(slugOrName) || slugOrName.toLowerCase();
  const direct = await db(() => prisma.tag.findUnique({ where: { type_slug: { type, slug: s } }, select: tagColsWithHidden }));
  if (direct) return direct;
  const alias = await db(() => prisma.tagAlias.findUnique({ where: { type_slug: { type, slug: s } }, include: { target: { select: tagColsWithHidden } } }));
  if (alias) return alias.target;
  return db(() => prisma.tag.findFirst({ where: { type, name: { equals: slugOrName, mode: "insensitive" } }, select: tagColsWithHidden }));
});

/** Resolve search terms to tag ids. A positive term with no matching tag means "no results". */
export async function resolveTerms(terms: Term[]): Promise<{ include: number[]; exclude: number[]; missing: string[]; cats: string[] }> {
  const include: number[] = [], exclude: number[] = [], missing: string[] = [], cats: string[] = [];
  for (const t of terms) {
    const type = TYPE_BY_SLUG[t.field];
    const tag = await getTag(type, t.value);
    if (!tag) {
      if (!t.neg) missing.push(`${t.field}:${t.value}`);
      continue;
    }
    (t.neg ? exclude : include).push(tag.id);
  }
  return { include, exclude, missing, cats };
}

export async function listTags(o: { type: TagType; q?: string; sort?: "popular" | "name"; page?: number; pageSize?: number; letter?: string }) {
  const size = o.pageSize ?? 120;
  const page = Math.max(1, o.page ?? 1);
  const w: Prisma.TagWhereInput = {
    type: o.type,
    hidden: false,
    count: { gt: 0 },
    ...(o.q ? { name: { contains: o.q, mode: "insensitive" } } : {}),
    ...(o.letter
      ? o.letter === "#"
        ? { OR: "0123456789".split("").map((d) => ({ name: { startsWith: d } })) }
        : { name: { startsWith: o.letter, mode: "insensitive" as const } }
      : {}),
  };
  const rows = await db(() =>
    prisma.tag.findMany({
      where: w,
      orderBy: o.sort === "name" ? [{ name: "asc" }] : [{ count: "desc" }, { name: "asc" }],
      skip: (page - 1) * size,
      take: size + 1,
      select: tagCols,
    }),
  );
  return { items: rows.slice(0, size), hasNext: rows.length > size };
}

export const popularTags = cached("popular-tags", 600, async (type: TagType, take: number) =>
  db(() => prisma.tag.findMany({ where: { type, hidden: false, count: { gt: 0 } }, orderBy: { count: "desc" }, take, select: tagCols })),
);

export async function suggest(q: string, prefs: Prefs): Promise<SuggestResult> {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return { tags: [], works: [] };
  const like = term.replace(/[%_\\]/g, "\\$&");
  const [tags, works] = await Promise.all([
    db(() =>
      prisma.$queryRaw<SuggestResult["tags"]>(Prisma.sql`
        SELECT id, type::text AS type, name, slug, count FROM "Tag"
        WHERE hidden = false AND count > 0 AND type::text IN ('TAG','ARTIST','GROUP','PARODY','CHARACTER')
          AND (name ILIKE ${like + "%"} OR name ILIKE ${"% " + like + "%"})
        ORDER BY (name ILIKE ${like + "%"}) DESC, count DESC LIMIT 6`),
    ),
    listWorks({ text: [term], sort: "popular", pageSize: 5, ...prefFilters(prefs) }),
  ]);
  return {
    tags,
    works: works.items.map((w) => ({ publicId: w.publicId, slug: w.slug, title: w.title, language: w.language, coverKey: w.coverKey })),
  };
}

/* ───────────────────────────── a single work ───────────────────────────── */

export const getWork = cache(async (publicId: number) => {
  const w = await db(() =>
    prisma.work.findFirst({
      where: { publicId, publish: "PUBLISHED" },
      include: {
        tags: { where: { hidden: false }, orderBy: { count: "desc" }, select: tagCols },
        chapters: { where: { status: "READY" }, orderBy: { number: "asc" }, select: { number: true, title: true, volume: true, pageCount: true, publishedAt: true } },
      },
    }),
  );
  if (!w) return null;
  const byType: Record<string, TagLite[]> = {};
  for (const t of w.tags) (byType[t.type] ??= []).push(t);
  return { ...w, byType };
});

/** Other-language versions of the same work. Cached per request: the page and its metadata (hreflang) both need it. */
export const getVariants = cache(async (groupId: string | null, selfId: string) => {
  if (!groupId) return [];
  return db(() =>
    prisma.work.findMany({
      where: { translationGroupId: groupId, id: { not: selfId }, publish: "PUBLISHED", pageCount: { gt: 0 } },
      select: { publicId: true, slug: true, language: true, pageCount: true },
      orderBy: [{ language: "asc" }, { publicId: "asc" }],
    }),
  );
});

/** Works that share the most distinctive tags. */
export async function getRelated(work: { publicId: number; language: string; tagIds: number[] }, prefs: Prefs, take = 12): Promise<WorkCard[]> {
  if (!work.tagIds.length) return [];
  // the rarest tags say the most about a work: rank by how few works carry them
  const rare = await db(() =>
    prisma.tag.findMany({ where: { id: { in: work.tagIds }, type: { in: ["TAG", "PARODY", "CHARACTER", "ARTIST", "GROUP"] }, count: { gt: 1 } }, orderBy: { count: "asc" }, take: 6, select: { id: true } }),
  );
  if (!rare.length) return [];
  const ids = rare.map((t) => t.id);
  const f = prefFilters(prefs);
  const rows = await db(() =>
    prisma.$queryRaw<WorkCard[]>(Prisma.sql`
      SELECT ${CARD} FROM "Work" w
      WHERE ${where({ ...f, excludeId: work.publicId, langs: f.langs ?? [work.language] })} AND w."tagIds" && ${ids}::int[]
      ORDER BY ${POP} DESC LIMIT ${take}`),
  );
  return rows;
}

/* ───────────────────────────── reader ───────────────────────────── */

/** Cached per request: the page and its metadata both ask for it. */
export const getReaderData = cache(async (publicId: number, chapterNumber: number) => {
  const work = await db(() =>
    prisma.work.findFirst({
      where: { publicId, publish: "PUBLISHED" },
      select: { id: true, publicId: true, slug: true, title: true, mediaId: true, kind: true, language: true },
    }),
  );
  if (!work) return null;
  const chapters = await db(() =>
    prisma.chapter.findMany({ where: { workId: work.id, status: "READY" }, orderBy: { number: "asc" }, select: { number: true, title: true, pageCount: true } }),
  );
  const current = await db(() =>
    prisma.chapter.findFirst({ where: { workId: work.id, status: "READY", number: chapterNumber }, select: { id: true, number: true, title: true, pageData: true } }),
  );
  if (!current) return null;
  const i = chapters.findIndex((c) => c.number === chapterNumber);
  return { work, chapters, current, prev: chapters[i - 1]?.number ?? null, next: chapters[i + 1]?.number ?? null };
});

/* ───────────────────────────── lists by id, random ───────────────────────────── */

/** Cards for specific works (favourites, history), keeping the order asked for. */
export async function getCardsByIds(ids: number[]): Promise<WorkCard[]> {
  const list = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
  if (!list.length) return [];
  const rows = await db(() =>
    prisma.$queryRaw<WorkCard[]>(Prisma.sql`SELECT ${CARD} FROM "Work" w WHERE w."publicId" = ANY(${list}::int[]) AND w.publish = 'PUBLISHED' AND w."coverKey" IS NOT NULL`),
  );
  const by = new Map(rows.map((r) => [r.publicId, r]));
  return list.map((id) => by.get(id)).filter((x): x is WorkCard => !!x);
}

export async function randomPublicId(prefs: Prefs): Promise<number | null> {
  const f = prefFilters(prefs);
  const [{ max }] = await db(() => prisma.$queryRaw<{ max: number }[]>(Prisma.sql`SELECT coalesce(max("publicId"), 0)::int AS max FROM "Work"`));
  if (!max) return null;
  // jump to a random id and take the next published match: index-only, no sort of the whole table
  for (let i = 0; i < 4; i++) {
    const pick = Math.floor(Math.random() * max);
    const rows = await db(() =>
      prisma.$queryRaw<{ publicId: number }[]>(Prisma.sql`SELECT w."publicId" FROM "Work" w WHERE ${where(f)} AND w."publicId" >= ${pick} ORDER BY w."publicId" LIMIT 1`),
    );
    if (rows[0]) return rows[0].publicId;
  }
  const any = await db(() => prisma.$queryRaw<{ publicId: number }[]>(Prisma.sql`SELECT w."publicId" FROM "Work" w WHERE ${where(f)} ORDER BY w."publicId" DESC LIMIT 1`));
  return any[0]?.publicId ?? null;
}

/* ───────────────────────────── home ───────────────────────────── */

export const categoryCounts = cached("category-counts", 900, async () =>
  db(() => prisma.$queryRaw<{ category: string; n: number }[]>(Prisma.sql`SELECT category::text AS category, count(*)::int AS n FROM "Work" WHERE publish = 'PUBLISHED' AND "coverKey" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`)),
);

/** The home page lists for one set of preferences, cached briefly so a busy site is not one DB round-trip per visitor. */
export const homeLists = cached("home", 120, async (langs: string[], hide: number[]) => {
  const f = { langs: langs.length ? langs : undefined, exclude: hide.length ? hide : undefined };
  const [popular, fresh] = await Promise.all([
    listWorks({ ...f, sort: "popular", pageSize: 12 }),
    listWorks({ ...f, sort: "new", pageSize: 18 }),
  ]);
  return { popular: popular.items, fresh: fresh.items };
});
