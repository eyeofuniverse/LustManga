import { CATEGORIES, LANGUAGES } from "@/lib/format";
import type { Prefs } from "@/lib/prefs";
import { intParam } from "@/lib/url";

/** Lists stop at 10,000 results, so a page number beyond this can only be a wasteful deep OFFSET. */
export const MAX_PAGE = 500;

export interface ListFilters {
  sort: "popular" | "new";
  page: number;
  /** languages in effect: the URL wins, otherwise the visitor's saved choice. Empty = all. */
  langs: string[];
  cats: string[];
}

const LANG_CODES = new Set(LANGUAGES.map((l) => l.code));
const CAT_VALUES = new Set(CATEGORIES.map((c) => c.value));

export function parseFilters(sp: Record<string, string | undefined>, prefs: Prefs): ListFilters {
  const urlLangs = sp.lang === "all" ? [] : sp.lang ? sp.lang.split(",").filter((l) => LANG_CODES.has(l)) : null;
  return {
    sort: sp.sort === "new" ? "new" : "popular",
    page: intParam(sp.page, 1, 1, MAX_PAGE),
    langs: urlLangs ?? prefs.langs,
    cats: (sp.cat ?? "").split(",").filter((c) => CAT_VALUES.has(c)),
  };
}
