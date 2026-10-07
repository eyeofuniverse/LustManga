// Cross-source dedupe for works already in the database. Idempotent.
//   1. fills in titleNorm for works that lack it
//   2. merges clear duplicates: same language + normalised title, same kind, compatible artists,
//      similar size, and the copies come from DIFFERENT sources
//   3. queues near-title matches for an admin (Console, Duplicates)
//   4. confirms queued matches by comparing first-page image fingerprints: close = merge, far = dismiss
// A rejected copy always wins: if an admin rejected one, the other copy is rejected too.
//   npm run dedupe -- [--fuzzy-days=3] [--dry-run]
import { prisma } from "../src/lib/db";
import { artistsCompatible, findSimilar, hamming, mergeWorks, normTitle, pickSurvivor, recordCandidate } from "../src/lib/dedupe";
import { purgeImages } from "../src/lib/purge";

const arg = (n: string, d: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const dry = process.argv.includes("--dry-run");
const fuzzyDays = Number(arg("fuzzy-days", "3"));
const TOL = 2;
const PHASH_MERGE = 6; // out of 64 bits
const PHASH_REJECT = 20;

// 1 ─ titleNorm backfill
const missing = await prisma.work.findMany({ where: { titleNorm: null }, select: { id: true, title: true } });
if (!dry) for (const w of missing) await prisma.work.update({ where: { id: w.id }, data: { titleNorm: normTitle(w.title) } });
console.log(`titleNorm: ${missing.length} filled`);

// 2 ─ exact duplicates
type W = {
  id: string; publicId: number; publish: string; kind: string; pageCount: number; createdAt: Date;
  artists: string[]; sites: Set<string>; coverKey: string | null;
};
const groups = await prisma.$queryRaw<{ language: string; titleNorm: string }[]>`
  SELECT language, "titleNorm" FROM "Work" WHERE "titleNorm" IS NOT NULL AND "titleNorm" <> ''
  GROUP BY 1, 2 HAVING count(*) > 1`;

let merged = 0, rejectedFollow = 0, flagged = 0;
for (const g of groups) {
  const rows = await prisma.work.findMany({
    where: { language: g.language, titleNorm: g.titleNorm },
    select: {
      id: true, publicId: true, publish: true, kind: true, pageCount: true, createdAt: true, coverKey: true,
      tags: { where: { type: "ARTIST" }, select: { name: true } },
      sources: { select: { site: true } },
    },
  });
  const ws: W[] = rows.map((r) => ({ ...r, artists: r.tags.map((t) => t.name), sites: new Set(r.sources.map((s) => s.site)) }));

  const clusters: W[][] = [];
  for (const w of ws) {
    const home = clusters.find((c) =>
      c.every(
        (x) =>
          x.kind === w.kind &&
          artistsCompatible(x.artists, w.artists) &&
          !(x.kind === "ONESHOT" && x.pageCount > 0 && w.pageCount > 0 && Math.abs(x.pageCount - w.pageCount) > TOL) &&
          [...w.sites].every((s) => !x.sites.has(s)), // different sources only
      ),
    );
    if (home) home.push(w);
    else clusters.push([w]);
  }
  for (const c of clusters) {
    if (c.length < 2) continue;
    const sorted = c.slice().sort((a, b) => (pickSurvivor(a, b)[0] === a ? -1 : 1));
    const keep = sorted[0];
    const anyRejected = c.some((x) => x.publish === "REJECTED");
    for (const loser of sorted.slice(1)) {
      if (dry) { console.log(`  would ${anyRejected ? "reject" : "merge"} #${loser.publicId} ${anyRejected ? "(a copy was rejected)" : `into #${keep.publicId}`}`); continue; }
      if (anyRejected) {
        // keep the admin's rejection across sources
        if (loser.publish !== "REJECTED") {
          await purgeImages(loser.id, loser.coverKey);
          await prisma.work.update({ where: { id: loser.id }, data: { publish: "REJECTED", needsReview: false, reviewDecision: "REJECTED", reviewedAt: new Date(), reviewedBy: "dedupe", coverKey: null, pageCount: 0 } });
          rejectedFollow++;
        }
      } else {
        await mergeWorks(keep.id, loser.id);
        merged++;
      }
    }
  }
}
console.log(`exact duplicates: ${merged} merged, ${rejectedFollow} rejected to follow an earlier rejection`);

// 3 ─ near-title candidates for recent works
const recent = await prisma.work.findMany({
  where: { createdAt: { gt: new Date(Date.now() - fuzzyDays * 86_400_000) }, titleNorm: { not: null } },
  select: { id: true, titleNorm: true, language: true, kind: true, pageCount: true },
});
for (const w of recent) {
  const sims = await findSimilar({ titleNorm: w.titleNorm!, language: w.language, kind: w.kind as "ONESHOT" | "SERIES", pageCount: w.pageCount, artists: [] }, w.id);
  for (const s of sims) {
    if (dry) { flagged++; continue; }
    const exists = await prisma.duplicateCandidate.findFirst({ where: { OR: [{ workId: w.id, otherId: s.id }, { workId: s.id, otherId: w.id }] } });
    if (!exists) { await recordCandidate(w.id, s.id, s.score, ["similar title"]); flagged++; }
  }
}
console.log(`near-title matches queued: ${flagged}`);

// 4 ─ confirm open candidates with first-page fingerprints
const firstHash = async (workId: string) =>
  (await prisma.chapter.findFirst({ where: { workId, phash: { not: null } }, orderBy: { number: "asc" }, select: { phash: true } }))?.phash ?? null;
let confirmed = 0, dismissed = 0;
const open = await prisma.duplicateCandidate.findMany({ where: { status: "OPEN" }, take: 500 });
for (const cand of open) {
  const [a, b] = await Promise.all([
    prisma.work.findUnique({ where: { id: cand.workId } }),
    prisma.work.findUnique({ where: { id: cand.otherId } }),
  ]);
  if (!a || !b) { if (!dry) await prisma.duplicateCandidate.update({ where: { id: cand.id }, data: { status: "DISMISSED" } }); continue; }
  const [ha, hb] = await Promise.all([firstHash(a.id), firstHash(b.id)]);
  if (!ha || !hb) continue; // no images to compare yet
  const d = hamming(ha, hb);
  if (dry) { console.log(`  candidate #${a.publicId} vs #${b.publicId}: hash distance ${d}`); continue; }
  if (d <= PHASH_MERGE && a.language === b.language && a.kind === b.kind && !(a.kind === "ONESHOT" && Math.abs(a.pageCount - b.pageCount) > TOL)) {
    const [keep, drop] = pickSurvivor(a, b);
    if (a.publish === "REJECTED" || b.publish === "REJECTED") continue; // leave rejection cases to an admin
    await mergeWorks(keep.id, drop.id);
    confirmed++;
  } else if (d >= PHASH_REJECT) {
    await prisma.duplicateCandidate.update({ where: { id: cand.id }, data: { status: "DISMISSED" } });
    dismissed++;
  } else {
    await prisma.duplicateCandidate.update({ where: { id: cand.id }, data: { score: Math.max(cand.score, 1 - d / 64), reasons: [...new Set([...cand.reasons, `first page differs by ${d}/64 bits`])] } });
  }
}
console.log(`candidates: ${confirmed} merged by image match, ${dismissed} dismissed as different, ${open.length - confirmed - dismissed} left for an admin`);
await prisma.$disconnect();
