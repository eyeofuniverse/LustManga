// Indexes Prisma cannot express in the schema, plus default safety terms. Idempotent.
import { PrismaClient } from "@prisma/client";
import { CORE_QUARANTINE } from "../src/lib/safety/core";
import { DEFAULT_ALLOWED, DEFAULT_DEFER, DEFAULT_REVIEW } from "../src/lib/safety/terms";

const prisma = new PrismaClient();
const stmts = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE INDEX IF NOT EXISTS work_tagids_gin ON "Work" USING GIN ("tagIds")`,
  `CREATE INDEX IF NOT EXISTS work_title_trgm ON "Work" USING GIN (title gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS work_titlenorm_trgm ON "Work" USING GIN ("titleNorm" gin_trgm_ops)`,
  // "Popular" order = source score + 20 per view + 50 per favourite (the readers' part capped at OWN_TRAFFIC_CAP, 12500);
  // the SAME expression must appear in queries to use these
  `DROP INDEX IF EXISTS work_popular_idx`,
  `DROP INDEX IF EXISTS work_popular_lang_idx`,
  `CREATE INDEX IF NOT EXISTS work_popular_cap_idx ON "Work" (publish, (("seedPopularity" + LEAST(views * 20 + favorites * 50, 12500))) DESC)`,
  `CREATE INDEX IF NOT EXISTS work_popular_cap_lang_idx ON "Work" (publish, language, (("seedPopularity" + LEAST(views * 20 + favorites * 50, 12500))) DESC)`,
  `CREATE INDEX IF NOT EXISTS work_new_lang_idx ON "Work" (publish, language, "createdAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS tag_type_count_idx ON "Tag" (type, count DESC)`,
  // upsertTags looks a new tag name up by its hyphen-less spelling, so "Blow job" finds "blowjob"
  `CREATE INDEX IF NOT EXISTS tag_squash_idx ON "Tag" ((replace(slug, '-', '')))`,
  `CREATE INDEX IF NOT EXISTS tag_name_trgm ON "Tag" USING GIN (name gin_trgm_ops)`,
];
for (const sql of stmts) {
  await prisma.$executeRawUnsafe(sql);
  console.log("ok:", sql.slice(0, 80));
}

// seed term lists (never overwrites admin edits: only inserts missing rows)
const seed = [
  ...CORE_QUARANTINE.map((term) => ({ term, tier: "QUARANTINE" as const, locked: true })),
  ...DEFAULT_DEFER.map((term) => ({ term, tier: "DEFER" as const, locked: false })),
  ...DEFAULT_REVIEW.map((term) => ({ term, tier: "REVIEW" as const, locked: false })),
  ...DEFAULT_ALLOWED.map((term) => ({ term, tier: "ALLOWED" as const, locked: false })),
];
const r = await prisma.safetyTerm.createMany({ data: seed.map((s) => ({ ...s, createdBy: "seed" })), skipDuplicates: true });
console.log(`safety terms: ${r.count} inserted (${seed.length} defaults)`);
await prisma.$disconnect();
