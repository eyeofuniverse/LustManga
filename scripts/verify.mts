// Integrity check for stored content. Idempotent.
//   - samples READY pages and checks they load through the public CDN; a chapter with a
//     missing page goes back to the queue so the next ingest run re-fetches it
//   - READY chapters with no Page rows go back to the queue
//   - PUBLISHED works with no READY chapters are un-published back to DRAFT
import { prisma } from "../src/lib/db";
import { pool } from "../src/lib/http";

const sample = Number(process.argv.find((a) => a.startsWith("--sample="))?.split("=")[1] ?? 400);
const host = process.env.NEXT_PUBLIC_IMG_CDN_HOST;
if (!host) throw new Error("NEXT_PUBLIC_IMG_CDN_HOST not set");

const pages = await prisma.$queryRaw<{ key: string; chapterId: string }[]>`
  SELECT p.key, p."chapterId" FROM "Page" p
  JOIN "Chapter" c ON c.id = p."chapterId" AND c.status = 'READY'
  ORDER BY random() LIMIT ${sample}`;

const bad = new Set<string>();
await pool(pages, 16, async (p) => {
  try {
    const res = await fetch(`https://${host}/${p.key}`, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
    if (res.status === 404 || res.status === 410) bad.add(p.chapterId);
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
  UPDATE "Chapter" c SET status = 'QUEUED', error = 'verify: READY but no pages'
  WHERE c.status = 'READY' AND NOT EXISTS (SELECT 1 FROM "Page" p WHERE p."chapterId" = c.id)`;

const unpublished = await prisma.$executeRaw`
  UPDATE "Work" w SET publish = 'DRAFT'
  WHERE w.publish = 'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM "Chapter" c WHERE c."workId" = w.id AND c.status = 'READY')`;

console.log(`verified ${pages.length} pages; ${bad.size} chapter(s) re-queued (missing page), ${empty} re-queued (no pages), ${unpublished} work(s) un-published`);
await prisma.$disconnect();
