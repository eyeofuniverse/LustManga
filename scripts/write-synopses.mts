// Gives the most popular works that have NO description a short, factual summary (src/lib/synopsis.ts), so their pages
// and search snippets are not just "tags + site name". Only works whose description is empty are touched, and the ids
// are recorded in Settings ("synopsis-generated") so they can be told apart from source descriptions later.
//   npx tsx scripts/write-synopses.mts [--top=250]            dry run: counts and a few examples
//   npx tsx scripts/write-synopses.mts --top=250 --apply
import { prisma } from "../src/lib/db";
import { CORE_QUARANTINE } from "../src/lib/safety/core";
import { OWN_TRAFFIC_CAP } from "../src/lib/signals";
import { synopsis } from "../src/lib/synopsis";

const apply = process.argv.includes("--apply");
const top = Number(process.argv.find((a) => a.startsWith("--top="))?.split("=")[1]) || 250;

const works = await prisma.$queryRaw<{ id: string; publicId: number }[]>`
  SELECT id, "publicId" FROM "Work"
  WHERE publish = 'PUBLISHED' AND "coverKey" IS NOT NULL AND "pageCount" > 0 AND (description IS NULL OR length(btrim(description)) < 40)
  ORDER BY "seedPopularity" + LEAST(views * 20 + favorites * 50, ${OWN_TRAFFIC_CAP}::int) DESC, id DESC
  LIMIT ${top}`;

const full = await prisma.work.findMany({
  where: { id: { in: works.map((w) => w.id) } },
  select: { id: true, publicId: true, title: true, language: true, category: true, pageCount: true, translationGroupId: true, tags: { select: { type: true, name: true, count: true } } },
});
const groups = [...new Set(full.map((w) => w.translationGroupId).filter((g): g is string => !!g))];
const siblings = await prisma.work.findMany({ where: { translationGroupId: { in: groups }, publish: "PUBLISHED" }, select: { translationGroupId: true, language: true } });
const langsOf = new Map<string, Set<string>>();
for (const s of siblings) (langsOf.get(s.translationGroupId!) ?? langsOf.set(s.translationGroupId!, new Set()).get(s.translationGroupId!)!).add(s.language);

const out: { id: string; publicId: number; text: string }[] = [];
// whole words only: "Hololive" and "Shotaian" merely contain the letters
const QUARANTINED = new RegExp(String.raw`(^|[^\p{L}])(${CORE_QUARANTINE.join("|")})([^\p{L}]|$)`, "iu");
const quarantined = (s: string) => QUARANTINED.test(s);
let skipped = 0;
for (const w of full) {
  // never write text for anything that touches the hard-quarantine terms: those works are not published at all
  if (quarantined(w.title) || w.tags.some((t) => quarantined(t.name))) {
    skipped++;
    continue;
  }
  const byType = (t: string, n = 10) => w.tags.filter((x) => x.type === t).sort((a, b) => b.count - a.count).slice(0, n).map((x) => x.name);
  out.push({
    id: w.id,
    publicId: w.publicId,
    text: synopsis({
      publicId: w.publicId,
      title: w.title,
      language: w.language,
      category: w.category,
      pageCount: w.pageCount,
      artists: byType("ARTIST", 2),
      circles: byType("GROUP", 1),
      parodies: byType("PARODY", 1),
      characters: byType("CHARACTER", 3),
      // the tags readers actually search for (the most used first); file-level noise is filtered out by synopsis()
      tags: w.tags.filter((x) => x.type === "TAG").sort((a, b) => b.count - a.count).map((x) => x.name),
      translations: [...(langsOf.get(w.translationGroupId ?? "") ?? [])],
    }),
  });
}

console.log(`${out.length} top work(s) without a description${skipped ? ` (${skipped} skipped: quarantine terms)` : ""}`);
for (const o of out.slice(0, 6)) console.log(`\n#${o.publicId}\n${o.text}`);
const lengths = out.map((o) => o.text.length).sort((a, b) => a - b);
console.log(`\nlength: min ${lengths[0]}, median ${lengths[lengths.length >> 1]}, max ${lengths.at(-1)}; distinct texts: ${new Set(out.map((o) => o.text)).size}`);

if (apply && out.length) {
  await prisma.$executeRaw`
    UPDATE "Work" w SET description = v.text, "updatedAt" = now()
    FROM (SELECT unnest(${out.map((o) => o.id)}::text[]) AS id, unnest(${out.map((o) => o.text)}::text[]) AS text) v
    WHERE w.id = v.id AND (w.description IS NULL OR length(btrim(w.description)) < 40)`;
  const prev = await prisma.setting.findUnique({ where: { key: "synopsis-generated" } });
  const ids = [...new Set([...(((prev?.value as { ids?: number[] } | null)?.ids) ?? []), ...out.map((o) => o.publicId)])];
  await prisma.setting.upsert({ where: { key: "synopsis-generated" }, create: { key: "synopsis-generated", value: { ids, at: new Date().toISOString() } }, update: { value: { ids, at: new Date().toISOString() } } });
  console.log(`\napplied: ${out.length} description(s) written`);
} else if (!apply) {
  console.log("\ndry run: nothing written. Add --apply to write.");
}
await prisma.$disconnect();
