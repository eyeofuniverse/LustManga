// Tell search engines (Bing, Yandex, Seznam, Naver...) about new works so they are crawled within minutes.
//   npm run indexnow                 works that went live in the last 6 hours (what the ingest workflows run)
//   npm run indexnow -- --since=48h  a longer window (h = hours, d = days)
//   npm run indexnow -- --all        every published work, once (after launch, or a big import)
// Needs NEXT_PUBLIC_SITE_URL to be the real https address; otherwise it says so and does nothing.
import { prisma } from "../src/lib/db";
import { pingIndexNow } from "../src/lib/indexnow";
import { workHref } from "../src/lib/format";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`))?.split("=")[1];
const all = process.argv.includes("--all");
const m = /^(\d+)([hd])$/.exec(arg("since") ?? "6h");
if (!m && !all) throw new Error("--since must look like 6h or 2d");
const since = new Date(Date.now() - (m ? Number(m[1]) * (m[2] === "d" ? 24 : 1) * 3_600_000 : 0));

const works = await prisma.work.findMany({
  where: {
    publish: "PUBLISHED",
    coverKey: { not: null },
    pageCount: { gt: 0 },
    ...(all ? {} : { OR: [{ createdAt: { gt: since } }, { autoPublishedAt: { gt: since } }, { reviewedAt: { gt: since } }] }),
  },
  select: { publicId: true, slug: true },
  orderBy: { publicId: "asc" },
});
const urls = works.map((w) => workHref(w));
if (!urls.length) {
  console.log("indexnow: nothing new to submit");
} else {
  const r = await pingIndexNow(urls);
  console.log(r.skipped ? `indexnow: skipped (${r.skipped})` : `indexnow: ${r.submitted} submitted, ${r.failed} failed (of ${urls.length} works)`);
}
await prisma.$disconnect();
