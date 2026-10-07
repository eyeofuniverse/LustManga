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
    wanted.set(`${it.type}:${s}`, { type: it.type, name, slug: s });
  }
  if (!wanted.size) return [];
  const list = [...wanted.values()];
  const where = { OR: list.map((t) => ({ type: t.type, slug: t.slug })) };

  const ids = new Set<number>();
  const aliases = await db(() => prisma.tagAlias.findMany({ where, select: { type: true, slug: true, targetTagId: true } }));
  const aliased = new Set(aliases.map((a) => `${a.type}:${a.slug}`));
  for (const a of aliases) ids.add(a.targetTagId);

  const rest = list.filter((t) => !aliased.has(`${t.type}:${t.slug}`));
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
