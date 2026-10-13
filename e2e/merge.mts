// Merging two copies of a work (the nightly dedupe) must keep what readers wrote about the one that goes away: its comments move to
// the survivor, and so do its ratings (a member who rated both keeps the survivor's), with the survivor's average recomputed.
//   npx tsx --env-file=.env e2e/merge.mts
// Everything is made as unpublished "zzmerge" rows and removed again at the end.
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { mergeWorks } from "../src/lib/dedupe";

let fails = 0;
const ok = (c: boolean, n: string, x = "") => {
  if (!c) fails++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && x ? `  [${x}]` : ""}`);
};
const clean = async () => {
  await prisma.work.deleteMany({ where: { title: { startsWith: "zzmerge" } } });
  await prisma.member.deleteMany({ where: { handle: { startsWith: "zzmerge" } } });
};
await clean();
try {
  const mk = (t: string) => prisma.work.create({ data: { title: `zzmerge ${t}`, slug: `zzmerge-${t}`, publish: "DRAFT", language: "en" } });
  const keep = await mk("keep");
  const drop = await mk("drop");
  const member = (h: string) => prisma.member.create({ data: { handle: h, displayName: h, passwordHash: bcrypt.hashSync("x", 4) } });
  const [a, b, c] = [await member("zzmergea"), await member("zzmergeb"), await member("zzmergec")];
  // a rated only the loser (5), b rated both (keep 2, drop 4), c rated only the survivor (3)
  await prisma.workRating.createMany({ data: [{ memberId: a.id, workId: drop.id, value: 5 }, { memberId: b.id, workId: drop.id, value: 4 }, { memberId: b.id, workId: keep.id, value: 2 }, { memberId: c.id, workId: keep.id, value: 3 }] });
  await prisma.work.update({ where: { id: keep.id }, data: { ratingSum: 5, ratingCount: 2 } });
  await prisma.work.update({ where: { id: drop.id }, data: { ratingSum: 9, ratingCount: 2 } });
  const top = await prisma.comment.create({ data: { workId: drop.id, memberId: a.id, body: "zzmerge top" } });
  await prisma.comment.create({ data: { workId: drop.id, memberId: b.id, parentId: top.id, body: "zzmerge reply" } });
  await prisma.comment.create({ data: { workId: keep.id, memberId: c.id, body: "zzmerge on the survivor" } });

  await mergeWorks(keep.id, drop.id);

  ok((await prisma.work.count({ where: { id: drop.id } })) === 0, "the loser is gone");
  const comments = await prisma.comment.findMany({ where: { workId: keep.id }, select: { body: true, parentId: true } });
  ok(comments.length === 3 && comments.some((x) => x.body === "zzmerge reply" && x.parentId === top.id), "all three comments are on the survivor, the reply still under its comment", JSON.stringify(comments));
  const ratings = await prisma.workRating.findMany({ where: { workId: keep.id }, select: { memberId: true, value: true } });
  const byMember = new Map(ratings.map((r) => [r.memberId, r.value]));
  ok(ratings.length === 3 && byMember.get(a.id) === 5 && byMember.get(b.id) === 2 && byMember.get(c.id) === 3, "ratings moved; the member who rated both keeps the survivor's", JSON.stringify(ratings));
  const w = await prisma.work.findUnique({ where: { id: keep.id }, select: { ratingSum: true, ratingCount: true } });
  ok(w!.ratingSum === 10 && w!.ratingCount === 3, "the survivor's average is worked out again from what is there", JSON.stringify(w));
} finally {
  await clean();
  ok((await prisma.work.count({ where: { title: { startsWith: "zzmerge" } } })) === 0 && (await prisma.member.count({ where: { handle: { startsWith: "zzmerge" } } })) === 0, "the test data is gone");
  await prisma.$disconnect();
}
console.log(fails ? `\n${fails} FAILED` : "\nall merge checks passed");
process.exit(fails ? 1 : 0);
