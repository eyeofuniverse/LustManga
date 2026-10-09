// Rewrites stored work titles from raw release names to readable ones (see src/lib/titles.ts), and gives each work
// the URL slug of its new title. The old addresses keep working: the work page redirects any other slug to the
// current one. titleNorm is left alone (search and duplicate detection still match the original wording), and the
// part of a "Romaji | Translation" title that is not shown moves to titleOriginal when that is empty.
//   npx tsx scripts/clean-titles.mts            dry run: counts and a sample of before -> after
//   npx tsx scripts/clean-titles.mts --apply    write the changes
import { prisma } from "../src/lib/db";
import { cleanTitle } from "../src/lib/titles";
import { slug } from "../src/lib/tags";

const apply = process.argv.includes("--apply");
const showAll = process.argv.includes("--all");

// MangaDex titles are already the series' real names ("[Oshi no Ko]" must stay as it is)
const rows = await prisma.$queryRaw<{ id: string; publicId: number; title: string; slug: string; titleOriginal: string | null }[]>`
  SELECT w.id, w."publicId", w.title, w.slug, w."titleOriginal" FROM "Work" w
  WHERE NOT EXISTS (SELECT 1 FROM "WorkSource" s WHERE s."workId" = w.id AND s.site = 'mangadex')
  ORDER BY w."publicId"`;

const changes: { id: string; publicId: number; before: string; title: string; slug: string; original: string | null }[] = [];
for (const r of rows) {
  const c = cleanTitle(r.title);
  if (c.title === r.title) continue;
  changes.push({ id: r.id, publicId: r.publicId, before: r.title, title: c.title, slug: slug(c.title) || "work", original: r.titleOriginal ? null : c.original });
}

console.log(`${rows.length} work(s) checked, ${changes.length} title(s) to change`);
const sample = showAll ? changes : changes.filter((_, i) => i % Math.max(1, Math.floor(changes.length / 40)) === 0).slice(0, 40);
for (const c of sample) console.log(`#${c.publicId}\n   ${c.before}\n-> ${c.title}`);
const odd = changes.filter((c) => c.title.length < 4 || /[\[\]{}]/.test(c.title) || c.title === "Untitled");
console.log(`\n${odd.length} result(s) that look odd:`);
for (const c of odd.slice(0, 30)) console.log(`#${c.publicId}  ${c.before}  ->  ${c.title}`);

if (apply && changes.length) {
  const CHUNK = 400;
  for (let i = 0; i < changes.length; i += CHUNK) {
    const part = changes.slice(i, i + CHUNK);
    await prisma.$executeRaw`
      UPDATE "Work" w SET title = v.title, slug = v.slug, "titleOriginal" = COALESCE(w."titleOriginal", v.original), "updatedAt" = now()
      FROM (SELECT unnest(${part.map((c) => c.id)}::text[]) AS id, unnest(${part.map((c) => c.title)}::text[]) AS title,
                   unnest(${part.map((c) => c.slug)}::text[]) AS slug, unnest(${part.map((c) => c.original)}::text[]) AS original) v
      WHERE w.id = v.id`;
  }
  console.log(`\napplied: ${changes.length} title(s) rewritten`);
} else if (!apply) {
  console.log("\ndry run: nothing written. Add --apply to write.");
}
await prisma.$disconnect();
