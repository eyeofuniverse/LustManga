import { prisma } from "@/lib/db";

/** Where a path that no longer exists now lives (a work merged into another), or null. Best effort: never throws. */
export async function findRedirect(fromPath: string): Promise<string | null> {
  try {
    return (await prisma.redirectMap.findUnique({ where: { fromPath }, select: { toPath: true } }))?.toPath ?? null;
  } catch {
    return null;
  }
}

/**
 * Remember that `fromPath` now lives at `toPath`. Anything that pointed at `fromPath` is re-pointed too, so a
 * chain of merges stays one hop and a visitor is never bounced twice.
 */
export async function recordRedirect(fromPath: string, toPath: string): Promise<void> {
  if (fromPath === toPath) return;
  await prisma.$transaction([
    prisma.redirectMap.updateMany({ where: { toPath: fromPath }, data: { toPath } }),
    prisma.redirectMap.upsert({ where: { fromPath }, create: { fromPath, toPath }, update: { toPath } }),
  ]);
}
