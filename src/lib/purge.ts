import { prisma } from "@/lib/db";
import { pool } from "@/lib/http";
import { r2Delete, r2List } from "@/lib/r2";

/**
 * Delete every stored image for a work and drop its chapters. Lists the work's whole folder in R2,
 * so files left behind by an interrupted chapter are removed too. Returns how many objects went.
 */
export async function purgeImages(workId: string, coverKey: string | null): Promise<number> {
  const work = await prisma.work.findUnique({ where: { id: workId }, select: { mediaId: true } });
  const keys = new Set<string>(coverKey ? [coverKey] : []);
  if (work) for (const k of await r2List(`w/${work.mediaId}/`).catch(() => [])) keys.add(k);
  await pool([...keys], 16, (k) => r2Delete(k).catch(() => {}));
  await prisma.chapter.deleteMany({ where: { workId } });
  return keys.size;
}
