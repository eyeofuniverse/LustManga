// Derived numbers: tag counts (published works only) and per-work page totals. Idempotent.
import { prisma } from "../src/lib/db";

const tags = await prisma.$executeRaw`
  UPDATE "Tag" t SET count = c.n
  FROM (
    SELECT t2.id, (SELECT count(*) FROM "Work" w WHERE w.publish = 'PUBLISHED' AND w."tagIds" @> ARRAY[t2.id])::int AS n
    FROM "Tag" t2
  ) c
  WHERE c.id = t.id AND t.count <> c.n`;

const works = await prisma.$executeRaw`
  UPDATE "Work" w SET "pageCount" = s.n
  FROM (
    SELECT w2.id, COALESCE((SELECT sum(c."pageCount") FROM "Chapter" c WHERE c."workId" = w2.id AND c.status = 'READY'), 0)::int AS n
    FROM "Work" w2
  ) s
  WHERE s.id = w.id AND w."pageCount" <> s.n`;

console.log(`recompute: ${tags} tag count(s) and ${works} work page total(s) updated`);
await prisma.$disconnect();
