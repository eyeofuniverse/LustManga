// Read-only integrity and safety checks on the database. Changes nothing.
//   npm run audit:db
import { prisma } from "../src/lib/db";

const n = async (label: string, p: Promise<{ n: number }[]>, expectZero = true, note = "") => {
  const v = (await p)[0]?.n ?? 0;
  console.log(`${v === 0 || !expectZero ? "ok  " : "ISSUE"} ${label}: ${v}${note ? "  (" + note + ")" : ""}`);
  return v;
};
console.log("— catalogue");
console.log(JSON.stringify(await prisma.$queryRaw`SELECT publish::text AS publish, count(*)::int AS n FROM "Work" GROUP BY 1 ORDER BY 2 DESC`));
await n("published works without a cover", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" WHERE publish='PUBLISHED' AND "coverKey" IS NULL`);
await n("published works with 0 pages", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" WHERE publish='PUBLISHED' AND "pageCount" <= 0`);
await n("published works with no READY chapter", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" w WHERE publish='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM "Chapter" c WHERE c."workId"=w.id AND c.status='READY')`);
await n("published works whose pageCount differs from their READY chapters' pages", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" w WHERE publish='PUBLISHED' AND "pageCount" <> (SELECT coalesce(sum(c."pageCount"),0) FROM "Chapter" c WHERE c."workId"=w.id AND c.status='READY')`);
await n("READY chapters with no page data", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Chapter" WHERE status='READY' AND "pageData" IS NULL`);
await n("works with an empty title", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" WHERE publish='PUBLISHED' AND btrim(title)=''`);
await n("works with an empty or duplicate-prone slug", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" WHERE publish='PUBLISHED' AND (slug IS NULL OR btrim(slug)='')`);
await n("duplicate publicIds", prisma.$queryRaw`SELECT count(*)::int AS n FROM (SELECT "publicId" FROM "Work" GROUP BY 1 HAVING count(*)>1) x`);
await n("works with a title longer than 300 characters", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" WHERE publish='PUBLISHED' AND length(title)>300`);
await n("published works with a language outside the known list", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" WHERE publish='PUBLISHED' AND language !~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$' AND language NOT IN ('english','japanese','chinese')`);
console.log("languages:", JSON.stringify(await prisma.$queryRaw`SELECT language, count(*)::int AS n FROM "Work" WHERE publish='PUBLISHED' GROUP BY 1 ORDER BY 2 DESC LIMIT 12`));
await n("negative counters (views/favorites)", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" WHERE views<0 OR favorites<0`);
await n("works flagged needsReview but PUBLISHED", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" WHERE "needsReview" AND publish='PUBLISHED'`, false, "expected after the mass approval");

console.log("\n— tags");
await n("tags whose stored count differs from the real number of published works", prisma.$queryRaw`SELECT count(*)::int AS n FROM (SELECT t.id FROM "Tag" t LEFT JOIN "_WorkTags" x ON x."A"=t.id LEFT JOIN "Work" w ON w.id=x."B" AND w.publish='PUBLISHED' GROUP BY t.id, t.count HAVING t.count <> count(w.id)) z`);
await n("tags with a duplicate (type, slug)", prisma.$queryRaw`SELECT count(*)::int AS n FROM (SELECT 1 FROM "Tag" GROUP BY type, slug HAVING count(*)>1) z`);
await n("aliases pointing at a missing tag", prisma.$queryRaw`SELECT count(*)::int AS n FROM "TagAlias" a WHERE NOT EXISTS (SELECT 1 FROM "Tag" t WHERE t.id=a."targetTagId")`);
await n("aliases that shadow a live tag of the same type and slug", prisma.$queryRaw`SELECT count(*)::int AS n FROM "TagAlias" a JOIN "Tag" t ON t.slug=a.slug AND t.type=a.type`);

console.log("\n— safety");
console.log("configured term counts:", JSON.stringify(await prisma.$queryRaw`SELECT tier::text AS tier, count(*)::int AS n FROM "SafetyTerm" GROUP BY 1 ORDER BY 1`));
console.log("suppressed (quarantined) sources:", JSON.stringify(await prisma.$queryRaw`SELECT count(*)::int AS total, count(*) FILTER (WHERE "confirmedAt" IS NOT NULL)::int AS confirmed FROM "SuppressedSource"`));
const stored = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "SuppressedSource" s JOIN "WorkSource" ws ON ws.site=s.site AND ws."externalId"=s."externalId"`;
console.log(`${stored[0]!.n === 0 ? "ok  " : "ISSUE"} quarantined sources that also have a stored work: ${stored[0]!.n}`);
await n("DRAFT/REJECTED works that still have a cover or pages in the catalogue tables", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" WHERE publish='REJECTED' AND "coverKey" IS NOT NULL`, false, "rejected works should have had images deleted");

console.log("\n— sources, duplicates, jobs");
await n("works with no source at all", prisma.$queryRaw`SELECT count(*)::int AS n FROM "Work" w WHERE NOT EXISTS (SELECT 1 FROM "WorkSource" s WHERE s."workId"=w.id)`);
await n("source entries pointing at no work", prisma.$queryRaw`SELECT count(*)::int AS n FROM "WorkSource" s WHERE NOT EXISTS (SELECT 1 FROM "Work" w WHERE w.id=s."workId")`);
console.log("open duplicate candidates:", JSON.stringify(await prisma.$queryRaw`SELECT status::text AS status, count(*)::int AS n FROM "DuplicateCandidate" GROUP BY 1`));
console.log("chapters by status:", JSON.stringify(await prisma.$queryRaw`SELECT status::text AS status, count(*)::int AS n FROM "Chapter" GROUP BY 1`));
console.log("ingest runs, last 3 days:", JSON.stringify(await prisma.$queryRaw`SELECT site, count(*)::int AS runs, count(*) FILTER (WHERE NOT ok)::int AS failed, max("startedAt") AS last FROM "IngestRun" WHERE "startedAt" > now() - interval '3 days' GROUP BY 1 ORDER BY 1`));
console.log("open reports:", JSON.stringify(await prisma.$queryRaw`SELECT kind::text AS kind, status::text AS status, count(*)::int AS n FROM "Report" GROUP BY 1,2`));
console.log("admins:", JSON.stringify(await prisma.$queryRaw`SELECT role::text AS role, active, (\"totpEnabledAt\" IS NOT NULL) AS totp, count(*)::int AS n FROM "AdminUser" GROUP BY 1,2,3`));

console.log("\n— size");
console.log(JSON.stringify(await prisma.$queryRaw`SELECT relname AS "table", pg_size_pretty(pg_total_relation_size(c.oid)) AS size, reltuples::bigint::text AS rows FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r' ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 6`));
console.log("database:", JSON.stringify(await prisma.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`));
await prisma.$disconnect();
