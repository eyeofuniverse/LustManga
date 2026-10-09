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
  // far past anything real, and past what the database integer holds
  n = Math.min(n, unit ? 36_500 : 100_000);
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

/** Nothing to match on. A query of only punctuation ("!!!") normalises to nothing and counts as empty. */
export const isEmptyQuery = (p: ParsedQuery) =>
  !p.text.some((t) => normText(t)) && !p.excludeText.some((t) => normText(t)) && !p.terms.length && !p.pages.length && !p.uploaded.length;

/* ───────────────────────── the advanced-search form <-> the query string ───────────────────────── */

/** What the advanced-search form edits. Each field maps to a piece of the search syntax above. */
export interface SearchForm {
  words: string;
  include: { field: Field; value: string }[];
  exclude: { field: Field; value: string }[];
  pagesMin?: number;
  pagesMax?: number;
  /** "uploaded within": days, e.g. 7 for the last week */
  withinDays?: number;
}

export const emptyForm = (): SearchForm => ({ words: "", include: [], exclude: [] });

const quote = (v: string) => (/[\s"]/.test(v) ? `"${v.replace(/"/g, "")}"` : v);

/** The query string for a form, in the syntax the search page parses. */
export function buildQuery(f: SearchForm): string {
  const parts: string[] = [];
  const words = f.words.trim().replace(/\s+/g, " ");
  if (words) parts.push(words);
  for (const t of f.include) parts.push(`${t.field}:${quote(t.value)}`);
  for (const t of f.exclude) parts.push(`-${t.field}:${quote(t.value)}`);
  const lo = f.pagesMin && f.pagesMin > 0 ? Math.floor(f.pagesMin) : undefined;
  const hi = f.pagesMax && f.pagesMax > 0 ? Math.floor(f.pagesMax) : undefined;
  if (lo !== undefined && hi !== undefined && lo === hi) parts.push(`pages:${lo}`);
  else {
    if (lo !== undefined) parts.push(`pages:>=${lo}`);
    if (hi !== undefined) parts.push(`pages:<=${hi}`);
  }
  if (f.withinDays && f.withinDays > 0) parts.push(`uploaded:<${Math.floor(f.withinDays)}d`);
  return parts.join(" ");
}

/** The form for an existing query, so the panel opens showing what is already being searched. */
export function formFromQuery(q: string): SearchForm {
  const p = parseQuery(q);
  const form = emptyForm();
  form.words = p.text.join(" ");
  for (const t of p.terms) (t.neg ? form.exclude : form.include).push({ field: t.field, value: t.value });
  for (const c of p.pages) {
    if (c.op === ">=") form.pagesMin = c.n;
    else if (c.op === ">") form.pagesMin = c.n + 1;
    else if (c.op === "<=") form.pagesMax = c.n;
    else if (c.op === "<") form.pagesMax = Math.max(1, c.n - 1);
    else form.pagesMin = form.pagesMax = c.n;
  }
  const within = p.uploaded.find((c) => c.op === "<" || c.op === "<=");
  if (within) form.withinDays = within.n;
  return form;
}
