import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma, type TagType } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { cdn } from "@/lib/cdn";
import { tagHref, workHref } from "@/lib/format";
import { MIN_INDEXABLE_ENTRIES, abs } from "@/lib/seo";
import { planSitemaps, TAGS_PER_SITEMAP, WORKS_PER_SITEMAP, type SitemapEntry } from "@/lib/sitemap-xml";

/**
 * The sitemap is an index (/sitemap.xml) plus child files (/sitemap/<id>.xml), so Search Console reports each part
 * separately and no file is slow to build:
 *   0            the main pages, categories and languages
 *   1..T         tags, artists, circles, parodies and characters with at least two works (thinner ones are noindex)
 *   T+1..        works, 5,000 per file, with their cover image
 * Every URL here is one a crawler is allowed to index: nothing noindex, nothing blocked, nothing redirected.
 */
const HOURS = 3600;
const STATIC_PAGES = ["/", "/browse", "/updates", "/tags", "/artists", "/groups", "/parodies", "/characters", "/search/help", "/dmca", "/2257", "/privacy", "/terms"];
const LIST_TYPES = ["TAG", "ARTIST", "GROUP", "PARODY", "CHARACTER"] as const;

const VISIBLE_WORK = Prisma.sql`publish = 'PUBLISHED' AND "coverKey" IS NOT NULL AND "pageCount" > 0`;

/** How many indexable tags and published works there are (cached; a database blip throws so nothing empty gets cached). */
const counts = unstable_cache(
  async () => {
    const [tags, works] = await db(() =>
      Promise.all([
        prisma.tag.count({ where: { hidden: false, type: { in: [...LIST_TYPES] }, count: { gte: MIN_INDEXABLE_ENTRIES } } }),
        prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM "Work" WHERE ${VISIBLE_WORK}`).then((r) => r[0]?.n ?? 0),
      ]),
    );
    return { tags, works };
  },
  ["sitemap-counts-v1"],
  { revalidate: HOURS },
);

export async function sitemapPlan() {
  const c = await counts();
  return planSitemaps(c.tags, c.works);
}

const pages = unstable_cache(
  async (): Promise<SitemapEntry[]> => {
    const rows = await db(() =>
      prisma.tag.findMany({ where: { hidden: false, type: { in: ["CATEGORY", "LANGUAGE"] }, count: { gte: MIN_INDEXABLE_ENTRIES } }, select: { type: true, slug: true } }),
    );
    return [...STATIC_PAGES.map((p) => ({ url: abs(p) })), ...rows.map((t) => ({ url: abs(tagHref(t.type, t.slug)) }))];
  },
  ["sitemap-pages-v1"],
  { revalidate: 6 * HOURS },
);

const tagChunk = unstable_cache(
  async (chunk: number): Promise<SitemapEntry[]> => {
    const rows = await db(() =>
      prisma.tag.findMany({
        where: { hidden: false, type: { in: LIST_TYPES as unknown as TagType[] }, count: { gte: MIN_INDEXABLE_ENTRIES } },
        orderBy: [{ count: "desc" }, { id: "asc" }],
        skip: chunk * TAGS_PER_SITEMAP,
        take: TAGS_PER_SITEMAP,
        select: { type: true, slug: true },
      }),
    );
    return rows.map((t) => ({ url: abs(tagHref(t.type, t.slug)) }));
  },
  ["sitemap-tags-v2"],
  { revalidate: 6 * HOURS },
);

const workChunk = unstable_cache(
  async (chunk: number): Promise<SitemapEntry[]> => {
    const rows = await db(() =>
      prisma.work.findMany({
        where: { publish: "PUBLISHED", coverKey: { not: null }, pageCount: { gt: 0 } },
        orderBy: { publicId: "asc" },
        skip: chunk * WORKS_PER_SITEMAP,
        take: WORKS_PER_SITEMAP,
        select: { publicId: true, slug: true, updatedAt: true, coverKey: true },
      }),
    );
    return rows.map((w) => ({ url: abs(workHref(w)), lastmod: w.updatedAt.toISOString(), image: cdn(w.coverKey) ?? undefined }));
  },
  ["sitemap-works-v2"],
  { revalidate: 6 * HOURS },
);

/** Entries of one child sitemap, or null when the id is not in the plan. */
export async function sitemapEntries(id: number): Promise<SitemapEntry[] | null> {
  const plan = await sitemapPlan();
  const part = plan.find((p) => p.id === id);
  if (!part) return null;
  if (part.kind === "pages") return pages();
  return part.kind === "tags" ? tagChunk(part.chunk) : workChunk(part.chunk);
}
