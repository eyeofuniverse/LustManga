// One-off: bring popularity seeds already stored for MangaDex and Hentai2Read onto the common 0..50000 scale.
// Guarded by a Setting marker so it can never be applied twice.
import { prisma } from "../src/lib/db";

const KEY = "seed-scaled-v1";
if (await prisma.setting.findUnique({ where: { key: KEY } })) {
  console.log("already applied, nothing to do");
} else {
  const scale = async (site: string, max: number) =>
    prisma.$executeRaw`
      UPDATE "Work" w SET "seedPopularity" = LEAST(50000, round(50000 * ln(1 + "seedPopularity") / ln(1 + ${max}::float8)))::int
      FROM "WorkSource" s WHERE s."workId" = w.id AND s.site = ${site}`;
  const a = await scale("mangadex", 250_000);
  const b = await scale("hentai2read", 1_500_000);
  await prisma.setting.create({ data: { key: KEY, value: { at: new Date().toISOString(), mangadex: a, hentai2read: b } } });
  console.log(`rescaled ${a} MangaDex and ${b} Hentai2Read work(s)`);
}
await prisma.$disconnect();
