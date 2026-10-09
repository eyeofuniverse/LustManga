/**
 * Reader preferences that must be known on the SERVER (so lists arrive already filtered, with no flash of
 * content the visitor asked not to see). They live in a cookie; the client writes it, the server reads it.
 */
export interface HiddenTag {
  id: number;
  name: string;
}
export interface Prefs {
  /** language codes to show; empty = all languages */
  langs: string[];
  /** tags the visitor never wants to see */
  hide: HiddenTag[];
}

/** Browsers drop a cookie over 4 KB, which would silently lose every setting, so the hidden-tag list is capped. */
export const MAX_HIDDEN = 30;
export const PREFS_COOKIE = "lm_prefs";
export const AGE_COOKIE = "lm_age";
export const DEFAULT_PREFS: Prefs = { langs: [], hide: [] };

export function parsePrefs(raw: string | undefined | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const j = JSON.parse(decodeURIComponent(raw)) as Partial<Prefs>;
    return {
      langs: Array.isArray(j.langs) ? j.langs.filter((l): l is string => typeof l === "string" && /^[a-z]{2,3}$/.test(l)).slice(0, 20) : [],
      hide: Array.isArray(j.hide)
        ? j.hide
            .filter((h): h is HiddenTag => !!h && Number.isInteger(h.id) && h.id > 0 && h.id <= 2_147_483_647 && typeof h.name === "string")
            .map((h) => ({ id: h.id, name: h.name.slice(0, 60) }))
            .slice(0, MAX_HIDDEN)
        : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export const serializePrefs = (p: Prefs): string => encodeURIComponent(JSON.stringify(p));

/** Client-side: write a long-lived cookie (Secure on https). */
export function writeCookie(name: string, value: string) {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
}

/**
 * Swap hidden-tag ids that no longer exist for the tag they were merged into. `alive` are the ids still in the database,
 * `targetBySlug` maps the old slug of a merged tag to the surviving id, `slugOf` turns the remembered name into that slug.
 * Anything that cannot be resolved is kept as it is, and the result never lists a tag twice.
 */
export function remapHidden(hide: HiddenTag[], alive: Set<number>, targetBySlug: Map<string, number>, slugOf: (name: string) => string): HiddenTag[] {
  const seen = new Set<number>();
  return hide
    .map((h) => (alive.has(h.id) ? h : { ...h, id: targetBySlug.get(slugOf(h.name)) ?? h.id }))
    .filter((h) => !seen.has(h.id) && !!seen.add(h.id));
}
