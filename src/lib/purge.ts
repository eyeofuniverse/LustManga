import { prisma } from "@/lib/db";
import { r2Delete } from "@/lib/r2";

/** Delete every stored image (pages + cover) for a work and drop its chapters. Returns how many objects were removed. */
export async function purgeImages(workId: string, coverKey: string | null): Promise<number> {
  const pages = await prisma.page.findMany({ where: { chapter: { workId } }, select: { key: true } });
  for (const p of pages) await r2Delete(p.key).catch(() => {});
  if (coverKey) await r2Delete(coverKey).catch(() => {});
  await prisma.chapter.deleteMany({ where: { workId } }); // cascades Page rows
  return pages.length + (coverKey ? 1 : 0);
}
