// Generate the 280px card thumbnail (c/{mediaId}-s.webp) for covers stored before thumbnails existed.
// Idempotent: a work whose thumbnail already exists on the CDN is skipped.
//   npm run backfill-thumbs [-- --limit=500]
import { prisma } from "../src/lib/db";
import { pool } from "../src/lib/http";
import { toWebp } from "../src/lib/images";
import { r2Put } from "../src/lib/r2";

const host = process.env.NEXT_PUBLIC_IMG_CDN_HOST;
if (!host) throw new Error("NEXT_PUBLIC_IMG_CDN_HOST not set");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 100_000);

const works = await prisma.work.findMany({
  where: { coverKey: { not: null } },
  select: { mediaId: true, coverKey: true },
  take: limit,
});
let made = 0, had = 0, failed = 0;
await pool(works, 8, async (w) => {
  try {
    const small = `https://${host}/c/${w.mediaId}-s.webp`;
    const head = await fetch(small, { method: "HEAD" });
    if (head.ok) return void had++;
    const res = await fetch(`https://${host}/${w.coverKey}`);
    if (!res.ok) throw new Error(`cover HTTP ${res.status}`);
    const img = await toWebp(Buffer.from(await res.arrayBuffer()), { maxWidth: 280 });
    await r2Put(`c/${w.mediaId}-s.webp`, img.data);
    made++;
  } catch {
    failed++;
  }
});
console.log(`thumbnails: ${made} created, ${had} already there, ${failed} failed (of ${works.length} covers)`);
await prisma.$disconnect();
