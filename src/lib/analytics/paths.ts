/**
 * What a page view is *about*, from its URL. The same normalisation runs in the browser (so it never sends a query string)
 * and again on the server (which never trusts what the browser says): a work page /g/123-some-title is counted as /g/123,
 * so a renamed work keeps one row and the "top pages" list is not a list of slugs.
 */
export type PageKind = "home" | "browse" | "work" | "read" | "tag" | "search" | "list" | "user" | "static" | "other";

export const PAGE_KINDS: PageKind[] = ["home", "browse", "work", "read", "tag", "search", "list", "user", "static", "other"];

export interface Normalised {
  path: string;
  kind: PageKind;
  /** public id of the work, for work and reader pages */
  workId: number | null;
}

const TAXONOMY = new Set(["tag", "artist", "group", "parody", "character", "language", "category"]);
const LISTS = new Set(["tags", "artists", "groups", "parodies", "characters"]);
const USER = new Set(["updates", "favorites", "following", "history", "settings", "random", "report-content"]);
const STATIC = new Set(["dmca", "2257", "privacy", "terms"]);
const MAX_PATH = 120;
const MAX_ID = 2_000_000_000;

const id = (s: string | undefined): number | null => {
  if (!s || !/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= MAX_ID ? n : null;
};

/** Not something to count: the admin console, the API and framework files. */
export function isUntracked(pathname: string): boolean {
  return /^\/(console|api|_next|console-preview)(\/|$)/.test(pathname);
}

/**
 * `raw` is a pathname as the browser reports it. Anything with a query or hash loses them. Returns null for a value that
 * is not a path, or for a path that is never tracked.
 */
export function normalisePath(raw: unknown): Normalised | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 400 || raw[0] !== "/") return null;
  let p = raw.split(/[?#]/)[0]!.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (isUntracked(p)) return null;
  // control characters never belong in a path (and would end up in a table the console prints)
  if (/[\u0000-\u001f\u007f]/.test(p)) return null;

  const seg = p.split("/").slice(1);
  const [a, b] = seg;

  if (p === "/") return { path: "/", kind: "home", workId: null };
  if (p === "/browse") return { path: p, kind: "browse", workId: null };
  if (p === "/search") return { path: p, kind: "search", workId: null };
  if (p === "/search/help") return { path: p, kind: "static", workId: null };

  if (a === "g" && seg.length === 2) {
    const w = id(/^(\d+)(?:-|$)/.exec(b ?? "")?.[1]);
    if (w) return { path: `/g/${w}`, kind: "work", workId: w };
  }
  if (a === "read" && seg.length >= 2) {
    const w = id(b);
    if (w) return { path: `/read/${w}`, kind: "read", workId: w };
  }
  if (a && b && seg.length === 2 && TAXONOMY.has(a)) return { path: clip(p), kind: "tag", workId: null };
  if (a && seg.length === 1 && LISTS.has(a)) return { path: p, kind: "list", workId: null };
  if (a && seg.length === 1 && USER.has(a)) return { path: p, kind: "user", workId: null };
  if (a && seg.length === 1 && STATIC.has(a)) return { path: p, kind: "static", workId: null };
  return { path: clip(p), kind: "other", workId: null };
}

const clip = (s: string) => (s.length > MAX_PATH ? s.slice(0, MAX_PATH) : s);
