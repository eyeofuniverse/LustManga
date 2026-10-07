// Housekeeping. Idempotent.
//   - retention: old ingest runs, login attempts, resolved duplicate candidates
//   - leftovers: a chapter that failed for good can leave partial files in R2; delete them
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { pool } from "../src/lib/http";
import { r2Delete, r2List } from "../src/lib/r2";
import { MAX_ATTEMPTS } from "../src/lib/ingest/shared";

const days = (n: number) => new Date(Date.now() - n * 86_400_000);

const runs = await prisma.ingestRun.deleteMany({ where: { startedAt: { lt: days(90) } } });
const logins = await prisma.adminLoginAttempt.deleteMany({ where: { createdAt: { lt: days(30) } } });
const dups = await prisma.duplicateCandidate.deleteMany({ where: { status: { in: ["MERGED", "DISMISSED"] }, createdAt: { lt: days(30) } } });
console.log(`retention: ${runs.count} old run(s), ${logins.count} login attempt(s), ${dups.count} resolved duplicate(s) removed`);

// parked chapters (never got page data) may have partial objects; clear them once, then mark them cleaned
const parked = await prisma.chapter.findMany({
  where: { status: "FAILED", attempts: { gte: MAX_ATTEMPTS }, pageData: { equals: Prisma.DbNull }, NOT: { error: { endsWith: "[cleaned]" } }, updatedAt: { lt: days(1) } },
  select: { id: true, error: true, work: { select: { mediaId: true } } },
  take: 100,
});
let removed = 0;
for (const c of parked) {
  const keys = await r2List(`w/${c.work.mediaId}/${c.id}/`).catch(() => []);
  await pool(keys, 16, (k) => r2Delete(k).catch(() => {}));
  removed += keys.length;
  await prisma.chapter.update({ where: { id: c.id }, data: { error: `${(c.error ?? "failed").slice(0, 280)} [cleaned]` } });
}
console.log(`leftovers: ${removed} partial file(s) removed from ${parked.length} parked chapter(s)`);
await prisma.$disconnect();
