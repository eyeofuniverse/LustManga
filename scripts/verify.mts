// Integrity check for stored content. Idempotent.
//   - samples pages of READY chapters and checks they load through the public CDN; a chapter with a
//     missing page goes back to the queue so the next ingest run re-fetches it
//   - READY chapters with no page data go back to the queue
//   - PUBLISHED works with no READY chapters are un-published back to DRAFT
import { prisma } from "../src/lib/db";
import { pool } from "../src/lib/http";
import { pagesOf } from "../src/lib/pages";

const sample = Number(process.argv.find((a) => a.startsWith("--sample="))?.split("=")[1] ?? 400);
const host = process.env.NEXT_PUBLIC_IMG_CDN_HOST;
if (!host) throw new Error("NEXT_PUBLIC_IMG_CDN_HOST not set");

// ORDER BY random() over the whole Chapter table gets slower with every work we add; TABLESAMPLE reads a
// small random slice of the table's blocks instead. (For a small table the percentage is 100: all of it.)
const est = Number((await prisma.$queryRaw<{ n: bigint }[]>`SELECT reltuples::bigint AS n FROM pg_class WHERE relname = 'Chapter'`)[0]?.n ?? 0);
const pct = Math.min(100, Math.max(0.01, (sample * 8 * 100) / Math.max(est, 1)));
const chapters = await prisma.$queryRaw<{ id: string; pageData: unknown; mediaId: string }[]>`
  SELECT c.id, c."pageData", w."mediaId" FROM "Chapter" c TABLESAMPLE SYSTEM (${pct}::float4)
  JOIN "Work" w ON w.id = c."workId"
  WHERE c.status = 'READY' AND c."pageData" IS NOT NULL ORDER BY random() LIMIT ${sample}`;
const targets = chapters.flatMap((c) => {
  const pages = pagesOf(c, c.mediaId);
  return pages.length ? [{ chapterId: c.id, key: pages[Math.floor(Math.random() * pages.length)].key }] : [];
});

const bad = new Set<string>();
await pool(targets, 16, async (t) => {
  try {
    const res = await fetch(`https://${host}/${t.key}`, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
    if (res.status === 404 || res.status === 410) bad.add(t.chapterId);
  } catch {
    /* network blip: not evidence of a missing file */
  }
});
if (bad.size) {
  await prisma.chapter.updateMany({
    where: { id: { in: [...bad] } },
    data: { status: "QUEUED", error: "verify: page missing on CDN", attempts: 0 },
  });
}

const empty = await prisma.$executeRaw`
  UPDATE "Chapter" c SET status = 'QUEUED', error = 'verify: READY but no page data'
  WHERE c.status = 'READY' AND (c."pageData" IS NULL OR jsonb_array_length(c."pageData") = 0)`;

const unpublished = await prisma.$executeRaw`
  UPDATE "Work" w SET publish = 'DRAFT'
  WHERE w.publish = 'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM "Chapter" c WHERE c."workId" = w.id AND c.status = 'READY')`;

console.log(`verified ${targets.length} pages (one per sampled chapter); ${bad.size} chapter(s) re-queued (missing page), ${empty} re-queued (no data), ${unpublished} work(s) un-published`);
await prisma.$disconnect();
