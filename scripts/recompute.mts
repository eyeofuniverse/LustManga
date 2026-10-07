// Derived numbers: tag counts (published works only) and per-work page totals. Idempotent.
// One aggregate pass each (linear in the data), not a query per tag or per work.
import { prisma } from "../src/lib/db";

const tags = await prisma.$executeRaw`
  WITH c AS (
    SELECT unnest("tagIds") AS id, count(*)::int AS n FROM "Work" WHERE publish = 'PUBLISHED' GROUP BY 1
  )
  UPDATE "Tag" t SET count = COALESCE(c.n, 0)
  FROM "Tag" t2 LEFT JOIN c ON c.id = t2.id
  WHERE t2.id = t.id AND t.count <> COALESCE(c.n, 0)`;

const works = await prisma.$executeRaw`
  UPDATE "Work" w SET "pageCount" = COALESCE(s.n, 0)
  FROM "Work" w2
  LEFT JOIN (SELECT "workId", sum("pageCount")::int AS n FROM "Chapter" WHERE status = 'READY' GROUP BY 1) s ON s."workId" = w2.id
  WHERE w2.id = w.id AND w."pageCount" <> COALESCE(s.n, 0)`;

console.log(`recompute: ${tags} tag count(s) and ${works} work page total(s) updated`);
await prisma.$disconnect();
