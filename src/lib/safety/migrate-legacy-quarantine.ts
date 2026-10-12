import { prisma } from "@/lib/db";
import { LEGACY_QUARANTINE_TERMS } from "@/lib/safety/terms";

export const LEGACY_QUARANTINE_MIGRATION_KEY = "safety:legacy-quarantine-migration-v2";

/** Requeue records held only by the old locked rules, then let the normal workflows rediscover metadata. */
export async function migrateLegacyQuarantine() {
  const done = await prisma.setting.findUnique({ where: { key: LEGACY_QUARANTINE_MIGRATION_KEY }, select: { key: true } });
  if (done) return { alreadyDone: true, terms: 0, requeued: 0, cursors: 0 };

  const locked = await prisma.safetyTerm.findMany({ where: { tier: "QUARANTINE", locked: true }, select: { term: true } });
  // Older installs may have only applied the code-level guard and never seeded its locked DB rows.
  // Keep a migration-only fallback so those quarantined sources can still be requeued safely.
  const terms = [...new Set([...LEGACY_QUARANTINE_TERMS, ...locked.map(({ term }) => term)])];
  const reasons = terms.flatMap((term) => [`tag:${term}`, `title:${term}`, `description:${term}`]);
  const stale = reasons.length ? await prisma.suppressedSource.findMany({ select: { id: true, reasons: true, confirmedAt: true } }) : [];
  const requeue = stale.filter((row) => !row.confirmedAt && row.reasons.length > 0 && row.reasons.every((reason) => reasons.includes(reason))).map((row) => row.id);

  const cursors = await prisma.$transaction(async (tx) => {
    await tx.safetyTerm.createMany({ data: terms.map((term) => ({ term, tier: "DEFER" as const, locked: false, createdBy: "safety-migration" })), skipDuplicates: true });
    await tx.safetyTerm.deleteMany({ where: { tier: "QUARANTINE", locked: true } });
    if (requeue.length) await tx.suppressedSource.deleteMany({ where: { id: { in: requeue } } });
    const cursorRows = await tx.setting.findMany({
      where: { OR: [
        { key: "mangadex:popular:offset" }, { key: "mangadex:backlog:cursor" },
        { key: { startsWith: "hitomi:popular:" } }, { key: "hentai2read:popular:page" },
        ...["hentaifox", "hentaiera", "asmhentai", "nhentaixxx"].map((site) => ({ key: { startsWith: `${site}:popular:` } })),
      ] }, select: { key: true },
    });
    for (const { key } of cursorRows) {
      const value = key === "mangadex:backlog:cursor" ? { since: "2000-01-01T00:00:00", offset: 0 } : key.endsWith(":offset") ? { offset: 0 } : { page: 1 };
      await tx.setting.update({ where: { key }, data: { value } });
    }
    await tx.setting.create({ data: { key: LEGACY_QUARANTINE_MIGRATION_KEY, value: { terms: terms.length, requeued: requeue.length, cursors: cursorRows.length } } });
    return cursorRows.length;
  }, { maxWait: 10_000, timeout: 60_000 });
  return { alreadyDone: false, terms: terms.length, requeued: requeue.length, cursors };
}
