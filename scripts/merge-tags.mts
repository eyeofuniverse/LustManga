// Merges tags that are really one tag spelled two ways: "Blow job" / "blowjob", "Un-censored" / "uncensored", the
// category pairs "game-cg" / "gamecg", ... Same type, same name once hyphens (spaces) are ignored. The tag with the
// most works survives (a category keeps its spelled-out form), every work moves across, and the old address becomes an
// alias that redirects permanently, so no link breaks. From now on upsertTags does the same at ingest.
//   npx tsx scripts/merge-tags.mts            dry run
//   npx tsx scripts/merge-tags.mts --apply    merge
import { prisma } from "../src/lib/db";
import { mergeTagRecords, squash, tagSurvivor } from "../src/lib/tags";

const apply = process.argv.includes("--apply");
const tags = await prisma.tag.findMany({ select: { id: true, type: true, name: true, slug: true, count: true, hidden: true, featured: true } });

const groups = new Map<string, typeof tags>();
for (const t of tags) {
  const key = `${t.type}:${squash(t.slug)}`;
  (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
}
const dupes = [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.reduce((n, t) => n + t.count, 0) - a.reduce((n, t) => n + t.count, 0));

console.log(`${dupes.length} group(s) of duplicate tags`);
for (const g of dupes) {
  const keep = tagSurvivor(g);
  const drop = g.filter((t) => t.id !== keep.id);
  console.log(`${g[0].type.padEnd(9)} keep "${keep.name}" (${keep.count})  <-  ${drop.map((t) => `"${t.name}" (${t.count})`).join(", ")}`);
  if (!apply) continue;
  for (const d of drop) await mergeTagRecords(d.id, keep.id);
  // a tag an admin hid or featured stays hidden / featured after the merge
  if (g.some((t) => t.hidden) || g.some((t) => t.featured)) {
    await prisma.tag.update({ where: { id: keep.id }, data: { hidden: g.some((t) => t.hidden) || undefined, featured: g.some((t) => t.featured) || undefined } });
  }
}
console.log(apply ? `\nmerged ${dupes.length} group(s)` : "\ndry run: nothing written. Add --apply to merge.");
await prisma.$disconnect();
