import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { tagHref, workHref } from "@/lib/format";

export const dynamic = "force-dynamic";
const CHUNK = 5000; // well under the 50,000-URL limit per sitemap file

/** Id 0 = static pages and the most-used tags. Ids 1..n = works, 5,000 per file. */
export async function generateSitemaps() {
  const published = await prisma.work.count({ where: { publish: "PUBLISHED" } }).catch(() => 0);
  const chunks = Math.max(1, Math.ceil(published / CHUNK));
  return Array.from({ length: chunks + 1 }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: number | Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const n = Number(await id);
  const abs = (p: string) => `${SITE_URL}${p}`;

  if (n === 0) {
    const tags = await prisma.tag
      .findMany({ where: { hidden: false, count: { gt: 0 } }, orderBy: { count: "desc" }, take: 20_000, select: { type: true, slug: true } })
      .catch(() => []);
    const statics = ["/", "/browse", "/tags", "/artists", "/groups", "/parodies", "/characters", "/search/help", "/dmca", "/privacy", "/terms", "/2257"];
    return [
      ...statics.map((p) => ({ url: abs(p), changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.6 })),
      ...tags.map((t) => ({ url: abs(tagHref(t.type, t.slug)), changeFrequency: "weekly" as const, priority: 0.5 })),
    ];
  }

  const works = await prisma.work
    .findMany({
      where: { publish: "PUBLISHED", coverKey: { not: null } },
      orderBy: { publicId: "asc" },
      skip: (n - 1) * CHUNK,
      take: CHUNK,
      select: { publicId: true, slug: true, updatedAt: true },
    })
    .catch(() => []);
  return works.map((w) => ({ url: abs(workHref(w)), lastModified: w.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 }));
}
