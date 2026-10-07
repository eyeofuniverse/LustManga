import slugify from "slugify";
import type { TagType } from "@prisma/client";
import { prisma, db } from "@/lib/db";

export const slug = (s: string) => slugify(s, { lower: true, strict: true }).slice(0, 80);

const LANG_NAMES: Record<string, string> = {
  en: "english", ja: "japanese", zh: "chinese", "zh-hk": "chinese", "zh-ro": "chinese", es: "spanish",
  "es-la": "spanish", fr: "french", pt: "portuguese", "pt-br": "portuguese", ko: "korean", ru: "russian",
  it: "italian", de: "german", id: "indonesian", vi: "vietnamese", th: "thai", tr: "turkish", pl: "polish",
  ar: "arabic", uk: "ukrainian", nl: "dutch", hu: "hungarian", cs: "czech", ro: "romanian", fil: "filipino",
};

/** Our language key: collapses regional variants (pt-br -> pt, es-la -> es, zh-hk -> zh). */
export const normLang = (code: string) => code.toLowerCase().split("-")[0];
export const langName = (code: string) => LANG_NAMES[code.toLowerCase()] ?? LANG_NAMES[normLang(code)] ?? code.toLowerCase();

/** Upsert tags and return their ids (deduped). */
export async function upsertTags(items: { type: TagType; name: string }[]): Promise<number[]> {
  const seen = new Map<string, { type: TagType; name: string; slug: string }>();
  for (const it of items) {
    const name = it.name.trim();
    const s = slug(name);
    if (!name || !s) continue;
    seen.set(`${it.type}:${s}`, { type: it.type, name, slug: s });
  }
  const ids: number[] = [];
  for (const t of seen.values()) {
    const row = await db(() =>
      prisma.tag.upsert({
        where: { type_slug: { type: t.type, slug: t.slug } },
        create: { type: t.type, name: t.name, slug: t.slug },
        update: {},
        select: { id: true },
      }),
    );
    ids.push(row.id);
  }
  return ids;
}
