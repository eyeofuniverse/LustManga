// Re-check every stored work against the CURRENT safety terms. Idempotent.
//
// Ingest only classifies a work when it first sees it. If an admin later adds a quarantine term, or a
// term list changes, works already stored would never be looked at again. This closes that gap:
//   - a work that now matches a QUARANTINE term is taken down for good (images deleted, its sources
//     recorded as quarantined metadata, the work removed)
//   - with --review, previously auto-published works that now match a review/defer term are put back
//     in the admin queue (off by default: changing a review term should not silently unpublish a catalogue)
//   npm run rescan -- [--review] [--dry-run]
import { prisma } from "../src/lib/db";
import { classify } from "../src/lib/safety/classify";
import { loadTerms } from "../src/lib/safety/load-terms";
import { takeDownWork } from "../src/lib/ingest/shared";

const dry = process.argv.includes("--dry-run");
const reviewToo = process.argv.includes("--review");
const terms = await loadTerms(true);

let scanned = 0, takenDown = 0, held = 0;
let cursor = "";
for (;;) {
  const batch = await prisma.work.findMany({
    where: { id: { gt: cursor }, publish: { not: "REJECTED" } },
    orderBy: { id: "asc" },
    take: 500,
    select: {
      id: true, title: true, titleOriginal: true, titleNorm: true, altTitles: true, description: true, publish: true, reviewedAt: true,
      tags: { where: { type: "TAG" }, select: { name: true } },
    },
  });
  if (!batch.length) break;
  for (const w of batch) {
    // title is the readable one (clean-titles.mts / cleanTitle); the original wording, circle names and watermarks it
    // dropped live on in titleOriginal and titleNorm, and a safety term can sit in any of them
    const alt = [...w.altTitles, w.titleOriginal, w.titleNorm].filter((s): s is string => !!s);
    const v = classify({ title: w.title, altTitles: alt, description: w.description, tags: w.tags.map((t) => t.name) }, terms);
    if (v.verdict === "QUARANTINE") {
      takenDown++;
      if (!dry) await takeDownWork(w.id, v.reasons);
    } else if (reviewToo && v.verdict === "REVIEW" && w.publish === "PUBLISHED" && !w.reviewedAt) {
      held++;
      if (!dry)
        await prisma.work.update({
          where: { id: w.id },
          data: { publish: "DRAFT", needsReview: true, deferFetch: v.deferFetch, safetyVerdict: "REVIEW", safetyReasons: v.reasons },
        });
    }
  }
  scanned += batch.length;
  cursor = batch[batch.length - 1].id;
}
console.log(`rescan: ${scanned} work(s) checked; ${takenDown} taken down (hard terms)${reviewToo ? `; ${held} returned to the review queue` : ""}${dry ? " [dry run]" : ""}`);
await prisma.$disconnect();
