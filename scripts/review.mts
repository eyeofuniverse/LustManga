// Admin review queue (CLI until the web console exists).
//   npm run review -- list
//   npm run review -- approve <publicId...>   false positive: release it (publishes once images are stored)
//   npm run review -- reject  <publicId...>   confirmed minor content: reject and purge stored images
//   npm run review -- suppressed              quarantined (hard-tag) works: metadata only
//   npm run review -- confirm <id...>         confirm a suppression after looking at it
// There is deliberately no "approve" for suppressed works.
import { prisma } from "../src/lib/db";
import { r2Delete } from "../src/lib/r2";

const [cmd, ...rest] = process.argv.slice(2);
const ids = rest.map(Number).filter(Number.isFinite);

async function purgeImages(workId: string, coverKey: string | null) {
  const pages = await prisma.page.findMany({ where: { chapter: { workId } }, select: { key: true } });
  for (const p of pages) await r2Delete(p.key);
  if (coverKey) await r2Delete(coverKey);
  await prisma.chapter.deleteMany({ where: { workId } }); // cascades Page rows
  return pages.length + (coverKey ? 1 : 0);
}

if (cmd === "list") {
  const works = await prisma.work.findMany({
    where: { needsReview: true, publish: "DRAFT" },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { sources: { select: { url: true }, take: 1 } },
  });
  console.log(`${works.length} work(s) awaiting review\n`);
  for (const w of works) {
    console.log(
      `#${w.publicId} [${w.language}] ${w.title}\n` +
        `   why: ${w.safetyReasons.join(", ")}\n` +
        `   ${w.deferFetch ? "NOT downloaded (explicit age marker) - judge from the source, approve to fetch" : `images stored, ${w.pageCount} pages`}\n` +
        `   source: ${w.sources[0]?.url ?? "-"}\n`,
    );
  }
} else if (cmd === "approve" && ids.length) {
  for (const publicId of ids) {
    const w = await prisma.work.findUnique({ where: { publicId }, select: { id: true, coverKey: true, pageCount: true, publish: true } });
    if (!w) { console.log(`#${publicId} not found`); continue; }
    const live = !!w.coverKey && w.pageCount > 0;
    await prisma.work.update({
      where: { id: w.id },
      data: {
        needsReview: false, reviewDecision: "APPROVED", reviewedAt: new Date(), reviewedBy: "cli",
        ...(live ? { publish: "PUBLISHED" as const } : {}),
      },
    });
    console.log(`#${publicId} approved${live ? " and published" : " - will publish once the next ingest run has stored its images"}`);
  }
} else if (cmd === "reject" && ids.length) {
  for (const publicId of ids) {
    const w = await prisma.work.findUnique({ where: { publicId }, select: { id: true, coverKey: true } });
    if (!w) { console.log(`#${publicId} not found`); continue; }
    const purged = await purgeImages(w.id, w.coverKey);
    await prisma.work.update({
      where: { id: w.id },
      data: { publish: "REJECTED", needsReview: false, reviewDecision: "REJECTED", reviewedAt: new Date(), reviewedBy: "cli", coverKey: null, pageCount: 0 },
    });
    console.log(`#${publicId} rejected, ${purged} stored image(s) deleted`);
  }
} else if (cmd === "suppressed") {
  const rows = await prisma.suppressedSource.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  console.log(`${rows.length} quarantined work(s) (metadata only, no images stored)\n`);
  for (const r of rows) console.log(`${r.id} ${r.site}:${r.externalId} [${r.reasons.join(", ")}] ${r.confirmedAt ? "confirmed" : "unconfirmed"}
   source: ${r.site === "mangadex" ? `https://mangadex.org/title/${r.externalId}` : "-"}`);
} else if (cmd === "confirm" && rest.length) {
  for (const id of rest) {
    await prisma.suppressedSource.update({ where: { id }, data: { confirmedAt: new Date() } });
    console.log(`${id} confirmed`);
  }
} else {
  console.log("usage: review list | approve <publicId...> | reject <publicId...> | suppressed | confirm <id...>");
}
await prisma.$disconnect();
