// Indexes Prisma can't express in the schema. Idempotent — safe to re-run.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const stmts = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  // fast "has tags A and B / not C" via array operators (@>, &&)
  `CREATE INDEX IF NOT EXISTS work_tagids_gin ON "Work" USING GIN ("tagIds")`,
  // fuzzy title search + title matching
  `CREATE INDEX IF NOT EXISTS work_title_trgm ON "Work" USING GIN (title gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS tag_name_trgm ON "Tag" USING GIN (name gin_trgm_ops)`,
];
for (const sql of stmts) {
  await prisma.$executeRawUnsafe(sql);
  console.log("ok:", sql.slice(0, 80));
}
await prisma.$disconnect();
