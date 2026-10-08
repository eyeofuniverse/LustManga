/**
 * Search syntax (pure, no database):
 *
 *   big breasts            words matched against titles
 *   "exact phrase"         quoted phrase
 *   tag:"x y"  -tag:x      include / exclude a tag
 *   artist: group: parody: character: language: category:
 *   pages:>20  pages:<=40  page count
 *   uploaded:<7d           uploaded within the last 7 days  (d, w, m, y)
 *   uploaded:>1y           uploaded more than a year ago
 *   -word                  exclude a title word
 */

export type Field = "tag" | "artist" | "group" | "parody" | "character" | "language" | "category";
export interface Term {
  neg: boolean;
  field: Field;
  value: string;
}
export type Op = ">" | "<" | ">=" | "<=" | "=";
export interface NumCond {
  op: Op;
  n: number;
}
export interface ParsedQuery {
  text: string[];
  excludeText: string[];
  terms: Term[];
  pages: NumCond[];
  /** age in days */
  uploaded: NumCond[];
}

const ALIAS: Record<string, Field | "pages" | "uploaded"> = {
  tag: "tag", tags: "tag",
  artist: "artist", artists: "artist", author: "artist",
  group: "group", circle: "group",
  parody: "parody", series: "parody",
  character: "character", char: "character",
  language: "language", lang: "language",
  category: "category", cat: "category",
  pages: "pages",
  uploaded: "uploaded", age: "uploaded",
};

/** Split on whitespace, but keep "quoted text" (also after a field: prefix) together. Quotes are dropped. */
export function tokenize(q: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let had = false;
  for (const ch of q) {
    if (ch === '"') {
      quoted = !quoted;
      had = true;
    } else if (/\s/.test(ch) && !quoted) {
      if (cur || had) out.push(cur);
      cur = "";
      had = false;
    } else cur += ch;
  }
  if (cur || had) out.push(cur);
  return out.filter((t) => t.length > 0);
}

const UNIT_DAYS: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

function parseNum(value: string, unit: boolean): NumCond | null {
  const m = value.match(/^(<=|>=|<|>|=)?\s*(\d+)\s*([dwmy])?$/i);
  if (!m) return null;
  let n = Number(m[2]);
  if (unit) n *= UNIT_DAYS[(m[3] ?? "d").toLowerCase()];
  return { op: (m[1] as Op) ?? "=", n };
}

export function parseQuery(q: string): ParsedQuery {
  const out: ParsedQuery = { text: [], excludeText: [], terms: [], pages: [], uploaded: [] };
  for (const raw of tokenize(q)) {
    let tok = raw;
    let neg = false;
    if (tok.startsWith("-") && tok.length > 1) {
      neg = true;
      tok = tok.slice(1);
    }
    const colon = tok.indexOf(":");
    const field = colon > 0 ? ALIAS[tok.slice(0, colon).toLowerCase()] : undefined;
    if (field) {
      const value = tok.slice(colon + 1).trim();
      if (!value) continue;
      if (field === "pages" || field === "uploaded") {
        const cond = parseNum(value, field === "uploaded");
        if (cond) (field === "pages" ? out.pages : out.uploaded).push(cond);
      } else {
        out.terms.push({ neg, field, value });
      }
    } else {
      (neg ? out.excludeText : out.text).push(tok);
    }
  }
  return out;
}

/** Lower-case, strip punctuation and accents: the same shape as Work.titleNorm, for matching. */
export const normText = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export const isEmptyQuery = (p: ParsedQuery) =>
  !p.text.length && !p.excludeText.length && !p.terms.length && !p.pages.length && !p.uploaded.length;
