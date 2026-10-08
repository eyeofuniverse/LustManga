import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const published = await prisma.work.count({ where: { publish: "PUBLISHED" } }).catch(() => 0);
  const chunks = Math.max(1, Math.ceil(published / 5000));
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/console", "/api/", "/read/", "/random", "/search", "/favorites", "/history", "/settings"] }],
    sitemap: Array.from({ length: chunks + 1 }, (_, i) => `${SITE_URL}/sitemap/${i}.xml`),
  };
}
