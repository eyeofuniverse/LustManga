import slugify from "slugify";
import type { TagType } from "@prisma/client";
import { prisma, db } from "@/lib/db";

/**
 * URL slug. ASCII names use the usual transliterating slugifier. Names with non-Latin letters keep them
 * (a slugifier would drop them: an artist called "ぴんく" would get an empty slug and vanish, and "Foo 夢"
 * and "Foo 愛" would both become "foo").
 */
export const slug = (s: string): string => {
  const name = s.normalize("NFKC").trim();
  if (/[^\x00-\x7F]/.test(name) && /[\p{L}\p{N}]/u.test(name.replace(/[\u0300-\u036f]/g, ""))) {
    const keepsNonLatin = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Thai}\p{Script=Greek}\p{Script=Hebrew}]/u.test(name);
    if (keepsNonLatin) return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }
  return slugify(name, { lower: true, strict: true }).slice(0, 80);
};

/** "blow-job" and "blowjob" are one tag: names that differ only by hyphens (spaces become hyphens) share this key. */
export const squash = (s: string): string => s.replace(/-/g, "");

/**
 * Move every work from tag `fromId` onto `toId` and delete `fromId`. Its old address keeps working: the slug becomes an
 * alias of the target, so /tag/blow-job lands on /tag/blowjob with a permanent redirect. The target's count is updated.
 */
export async function mergeTagRecords(fromId: number, toId: number): Promise<void> {
  const from = await prisma.tag.findUnique({ where: { id: fromId } });
  if (!from || fromId === toId) return;
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Work" SET "tagIds" = (SELECT array_agg(DISTINCT x) FROM unnest(array_replace("tagIds", ${fromId}, ${toId})) AS x) WHERE "tagIds" @> ARRAY[${fromId}]::int[]`,
    prisma.$executeRaw`INSERT INTO "_WorkTags" ("A","B") SELECT ${toId}, "B" FROM "_WorkTags" WHERE "A" = ${fromId} ON CONFLICT DO NOTHING`,
    prisma.$executeRaw`DELETE FROM "_WorkTags" WHERE "A" = ${fromId}`,
    prisma.tagAlias.updateMany({ where: { targetTagId: fromId }, data: { targetTagId: toId } }),
    prisma.tagAlias.upsert({
      where: { type_slug: { type: from.type, slug: from.slug } },
      create: { type: from.type, slug: from.slug, name: from.name, targetTagId: toId },
      update: { targetTagId: toId },
    }),
    prisma.tag.delete({ where: { id: fromId } }),
    prisma.$executeRaw`UPDATE "Tag" SET count = (SELECT count(*)::int FROM "Work" WHERE publish = 'PUBLISHED' AND "tagIds" @> ARRAY[${toId}]::int[]) WHERE id = ${toId}`,
  ]);
}

const LANG_NAMES: Record<string, string> = {
  en: "english", ja: "japanese", zh: "chinese", "zh-hk": "chinese", "zh-ro": "chinese", es: "spanish",
  "es-la": "spanish", fr: "french", pt: "portuguese", "pt-br": "portuguese", ko: "korean", ru: "russian",
  it: "italian", de: "german", id: "indonesian", vi: "vietnamese", th: "thai", tr: "turkish", pl: "polish",
  ar: "arabic", uk: "ukrainian", nl: "dutch", hu: "hungarian", cs: "czech", ro: "romanian", fil: "filipino",
};

/** Our language key: collapses regional variants (pt-br -> pt, es-la -> es, zh-hk -> zh). */
export const normLang = (code: string) => code.toLowerCase().split("-")[0];
export const langName = (code: string) => LANG_NAMES[code.toLowerCase()] ?? LANG_NAMES[normLang(code)] ?? code.toLowerCase();

/**
 * Resolve tags to ids in three queries total (aliases, existing, create-missing),
 * not two per tag. Source names that were merged into a canonical tag by an admin
 * (TagAlias) resolve to that tag.
 */
export async function upsertTags(items: { type: TagType; name: string }[]): Promise<number[]> {
  const wanted = new Map<string, { type: TagType; name: string; slug: string }>();
  for (const it of items) {
    const name = it.name.trim();
    const s = slug(name);
    if (!name || !s) continue;
    const key = `${it.type}:${squash(s)}`; // "blow job" and "blowjob" arriving together are one tag
    if (!wanted.has(key)) wanted.set(key, { type: it.type, name, slug: s });
  }
  if (!wanted.size) return [];
  const list = [...wanted.values()];
  const where = { OR: list.map((t) => ({ type: t.type, slug: t.slug })) };

  const ids = new Set<number>();
  const aliases = await db(() => prisma.tagAlias.findMany({ where, select: { type: true, slug: true, targetTagId: true } }));
  const aliased = new Set(aliases.map((a) => `${a.type}:${a.slug}`));
  for (const a of aliases) ids.add(a.targetTagId);

  let rest = list.filter((t) => !aliased.has(`${t.type}:${t.slug}`));
  if (rest.length) {
    // a name that differs from an existing tag only by hyphens or spaces ("Blow job", "blowjob") joins that tag
    const near = await db(() =>
      prisma.$queryRaw<{ id: number; type: string; slug: string }[]>`
        SELECT id, type::text AS type, slug FROM "Tag" WHERE replace(slug, '-', '') = ANY(${rest.map((t) => squash(t.slug))}::text[]) ORDER BY count DESC`,
    );
    const joined = new Set<string>();
    for (const t of rest) {
      if (near.some((n) => n.type === t.type && n.slug === t.slug)) continue; // the exact tag exists: the normal path finds it
      const hit = near.find((n) => n.type === t.type && squash(n.slug) === squash(t.slug));
      if (hit) {
        ids.add(hit.id);
        joined.add(`${t.type}:${t.slug}`);
      }
    }
    rest = rest.filter((t) => !joined.has(`${t.type}:${t.slug}`));
  }
  if (rest.length) {
    const restWhere = { OR: rest.map((t) => ({ type: t.type, slug: t.slug })) };
    let existing = await db(() => prisma.tag.findMany({ where: restWhere, select: { id: true, type: true, slug: true } }));
    const have = new Set(existing.map((t) => `${t.type}:${t.slug}`));
    const missing = rest.filter((t) => !have.has(`${t.type}:${t.slug}`));
    if (missing.length) {
      await db(() => prisma.tag.createMany({ data: missing, skipDuplicates: true }));
      existing = await db(() => prisma.tag.findMany({ where: restWhere, select: { id: true, type: true, slug: true } }));
    }
    for (const t of existing) ids.add(t.id);
  }
  return [...ids];
}

/**
 * Which of several spellings of one tag survives a merge: the one with the most works. A category keeps its spelled-out,
 * hyphenated form ("artist-cg", not "artistcg") because that is the label readers see.
 */
export function tagSurvivor<T extends { id: number; type: string; slug: string; count: number }>(group: T[]): T {
  const spelled = group.filter((t) => t.slug.includes("-"));
  const pool = group[0]?.type === "CATEGORY" && spelled.length ? spelled : group;
  return [...pool].sort((a, b) => b.count - a.count || a.id - b.id)[0];
}
