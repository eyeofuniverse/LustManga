"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The visitor's saved library lives in the browser (no account needed): favourites, and reading history with
 * the last page read and which chapters were opened. Hooks subscribe via useSyncExternalStore, so every
 * component (and every tab) updates the moment anything changes.
 */
const FAV = "lm:fav";
const HIST = "lm:history";
const EVENT = "lm:change";

export interface HistoryEntry {
  id: number;
  /** last chapter being read */
  ch: number;
  /** last page (1-based) */
  page: number;
  total: number;
  at: number;
  /** chapters already opened */
  done: number[];
}

const EMPTY_NUMS: number[] = [];
const EMPTY_HIST: HistoryEntry[] = [];
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, empty: T): T {
  if (typeof window === "undefined") return empty;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return empty;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T; // same string => same object (required by useSyncExternalStore)
  let value: T = empty;
  try {
    value = raw ? (JSON.parse(raw) as T) : empty;
  } catch {
    value = empty;
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked (private mode): the library just will not persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/* ───────── favourites ───────── */

export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, () => read<number[]>(FAV, EMPTY_NUMS), () => EMPTY_NUMS);
  const toggle = useCallback((id: number) => {
    const cur = read<number[]>(FAV, EMPTY_NUMS);
    write(FAV, cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, 500));
  }, []);
  const clear = useCallback(() => write(FAV, []), []);
  return { ids, has: (id: number) => ids.includes(id), toggle, clear };
}

/* ───────── history ───────── */

export function useHistory() {
  const items = useSyncExternalStore(subscribe, () => read<HistoryEntry[]>(HIST, EMPTY_HIST), () => EMPTY_HIST);
  const remove = useCallback((id: number) => write(HIST, read<HistoryEntry[]>(HIST, EMPTY_HIST).filter((h) => h.id !== id)), []);
  const clear = useCallback(() => write(HIST, []), []);
  return { items, byId: (id: number) => items.find((h) => h.id === id), remove, clear };
}

/** Record where the visitor is. Called (throttled) by the reader. */
export function recordProgress(id: number, ch: number, page: number, total: number) {
  const cur = read<HistoryEntry[]>(HIST, EMPTY_HIST);
  const prev = cur.find((h) => h.id === id);
  // a chapter counts as read once most of it has been seen, not merely opened
  const done = new Set(prev?.done ?? []);
  if (total > 0 && page / total >= 0.85) done.add(ch);
  const entry: HistoryEntry = { id, ch, page, total, at: Date.now(), done: [...done].sort((a, b) => a - b) };
  write(HIST, [entry, ...cur.filter((h) => h.id !== id)].slice(0, 120));
}

/** the visitor read through to the last page of the chapter they were in */
export const isFinished = (h: HistoryEntry | undefined) => !!h && h.total > 0 && h.page >= h.total;

export interface ResumePoint {
  ch: number;
  /** omitted = from the first page */
  page?: number;
  kind: "start" | "continue" | "next" | "again";
}

/**
 * Where "Start reading / Continue" should send someone. Mid-chapter: back to that page. Finished a chapter:
 * the start of the next one (or, with nothing left, the beginning again) rather than dropping them on the very last page.
 */
export function resumePoint(h: HistoryEntry | undefined, chapters: number[]): ResumePoint {
  const first = chapters[0] ?? 1;
  if (!h || !chapters.includes(h.ch)) return { ch: first, kind: "start" };
  if (isFinished(h)) {
    const next = chapters[chapters.indexOf(h.ch) + 1];
    return next != null ? { ch: next, kind: "next" } : { ch: first, kind: "again" };
  }
  if (h.page > 1) return { ch: h.ch, page: h.page, kind: "continue" };
  return h.ch === first ? { ch: first, kind: "start" } : { ch: h.ch, kind: "continue" };
}

/* ───────── reader preferences ───────── */

export interface ReaderPrefs {
  /** "auto" is a book for normal pages and a scroll for tall webtoon strips */
  mode: "auto" | "book" | "scroll";
  /** book mode direction */
  rtl: boolean;
  /** book mode: two pages side by side on wide screens */
  spread: "auto" | "off";
  /** max width of the page column in scroll mode, px */
  width: number;
  /** darken the page */
  dim: number;
  /** the colour behind the pages */
  bg: "black" | "gray" | "sepia" | "white";
  /** two-page spreads: the first page stands alone, like a printed book's cover (off pairs from page 1) */
  coverAlone: boolean;
  /** auto-play speed: 1 slow, 2 medium, 3 fast */
  autoSpeed: 1 | 2 | 3;
}
export const DEFAULT_READER: ReaderPrefs = { mode: "auto", rtl: false, spread: "auto", width: 860, dim: 0, bg: "black", coverAlone: true, autoSpeed: 2 };
const READER = "lm:reader";

export function useReaderPrefs() {
  const stored = useSyncExternalStore(subscribe, () => read<ReaderPrefs>(READER, DEFAULT_READER), () => DEFAULT_READER);
  // earlier versions stored "paged" (one page at a time), which is what book mode is now
  const prefs = (stored.mode as string) === "paged" ? { ...stored, mode: "book" as const } : stored;
  const set = useCallback((patch: Partial<ReaderPrefs>) => write(READER, { ...read<ReaderPrefs>(READER, DEFAULT_READER), ...patch }), []);
  return { prefs: { ...DEFAULT_READER, ...prefs }, set };
}

/* ───────── followed tags, artists and circles ───────── */

const FOLLOW = "lm:follow";
export const MAX_FOLLOWS = 60;
export interface Follow {
  id: number;
  /** tag type in lower case: tag, artist, group, parody, character */
  type: string;
  slug: string;
  name: string;
}
const EMPTY_FOLLOWS: Follow[] = [];

/** Things the visitor follows. The "Following" page lists the newest works carrying any of them. */
export function useFollows() {
  const items = useSyncExternalStore(subscribe, () => read<Follow[]>(FOLLOW, EMPTY_FOLLOWS), () => EMPTY_FOLLOWS);
  const toggle = useCallback((f: Follow) => {
    const cur = read<Follow[]>(FOLLOW, EMPTY_FOLLOWS);
    write(FOLLOW, cur.some((x) => x.id === f.id) ? cur.filter((x) => x.id !== f.id) : [f, ...cur].slice(0, MAX_FOLLOWS));
  }, []);
  return { items, has: (id: number) => items.some((x) => x.id === id), toggle };
}

/* ───────── recent searches ───────── */

const RECENT = "lm:recent";
const MAX_RECENT = 8;
const EMPTY_STRINGS: string[] = [];

export function useRecentSearches() {
  const items = useSyncExternalStore(subscribe, () => read<string[]>(RECENT, EMPTY_STRINGS), () => EMPTY_STRINGS);
  const add = useCallback((q: string) => {
    const term = q.trim().slice(0, 120);
    if (term.length < 2) return;
    const cur = read<string[]>(RECENT, EMPTY_STRINGS);
    write(RECENT, [term, ...cur.filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT));
  }, []);
  const remove = useCallback((q: string) => write(RECENT, read<string[]>(RECENT, EMPTY_STRINGS).filter((x) => x !== q)), []);
  const clear = useCallback(() => write(RECENT, []), []);
  return { items, add, remove, clear };
}

/* ───────── backup and restore ───────── */

/**
 * There are no accounts, so the way to move a library to another browser or device (or keep it safe) is a file:
 * saved works, reading history, follows, reader settings, language and hidden-tag choices.
 */
export interface Backup {
  v: 1;
  at: number;
  fav: number[];
  history: HistoryEntry[];
  follow: Follow[];
  reader: Partial<ReaderPrefs>;
  prefs: { langs: string[]; hide: { id: number; name: string }[] };
}

const isId = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 2_147_483_647;
const str = (s: unknown, max: number) => (typeof s === "string" ? s.slice(0, max) : "");

/** Parse and validate a backup file's text. Anything wrong with a field drops that field or entry, never the whole file. */
export function parseBackup(raw: string): Backup | null {
  if (raw.length > 2_000_000) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || j.v !== 1) return null;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const history: HistoryEntry[] = arr(j.history)
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object" && isId((h as { id?: unknown }).id))
    .slice(0, 120)
    .map((h) => ({
      id: h.id as number,
      ch: Number.isFinite(h.ch) ? (h.ch as number) : 1,
      page: Number.isInteger(h.page) && (h.page as number) > 0 ? (h.page as number) : 1,
      total: Number.isInteger(h.total) && (h.total as number) > 0 ? (h.total as number) : 1,
      at: Number.isFinite(h.at) ? (h.at as number) : 0,
      done: arr(h.done).filter((n): n is number => Number.isFinite(n)).slice(0, 2000),
    }));
  const follow: Follow[] = arr(j.follow)
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && isId((f as { id?: unknown }).id))
    .slice(0, MAX_FOLLOWS)
    .map((f) => ({ id: f.id as number, type: str(f.type, 12), slug: str(f.slug, 120), name: str(f.name, 80) }))
    .filter((f) => f.type && f.slug && f.name);
  const r = (j.reader && typeof j.reader === "object" ? j.reader : {}) as Record<string, unknown>;
  const reader: Partial<ReaderPrefs> = {};
  if (r.mode === "auto" || r.mode === "book" || r.mode === "scroll") reader.mode = r.mode;
  if (typeof r.rtl === "boolean") reader.rtl = r.rtl;
  if (r.spread === "auto" || r.spread === "off") reader.spread = r.spread;
  if (Number.isFinite(r.width)) reader.width = Math.min(1400, Math.max(480, r.width as number));
  if (Number.isFinite(r.dim)) reader.dim = Math.min(70, Math.max(0, r.dim as number));
  if (r.bg === "black" || r.bg === "gray" || r.bg === "sepia" || r.bg === "white") reader.bg = r.bg;
  if (typeof r.coverAlone === "boolean") reader.coverAlone = r.coverAlone;
  if (r.autoSpeed === 1 || r.autoSpeed === 2 || r.autoSpeed === 3) reader.autoSpeed = r.autoSpeed;
  const p = (j.prefs && typeof j.prefs === "object" ? j.prefs : {}) as { langs?: unknown; hide?: unknown };
  return {
    v: 1,
    at: Number.isFinite(j.at) ? (j.at as number) : 0,
    fav: arr(j.fav).filter(isId).slice(0, 500),
    history,
    follow,
    reader,
    prefs: {
      langs: arr(p.langs).filter((l): l is string => typeof l === "string" && /^[a-z]{2,3}$/.test(l)).slice(0, 20),
      hide: arr(p.hide)
        .filter((h): h is { id: number; name: string } => !!h && typeof h === "object" && isId((h as { id?: unknown }).id))
        .slice(0, 30)
        .map((h) => ({ id: h.id, name: str(h.name, 60) })),
    },
  };
}

/** Everything in this browser's library, as a backup (the language / hidden-tag choices come from the settings provider). */
export function buildBackup(prefs: Backup["prefs"]): Backup {
  return {
    v: 1,
    at: Date.now(),
    fav: read<number[]>(FAV, EMPTY_NUMS),
    history: read<HistoryEntry[]>(HIST, EMPTY_HIST),
    follow: read<Follow[]>(FOLLOW, EMPTY_FOLLOWS),
    reader: read<ReaderPrefs>(READER, DEFAULT_READER),
    prefs,
  };
}

/** Put a backup into this browser. "merge" keeps what is already here and adds the rest; "replace" starts from the file. */
export function applyBackup(b: Backup, mode: "merge" | "replace") {
  if (mode === "replace") {
    write(FAV, b.fav);
    write(HIST, b.history);
    write(FOLLOW, b.follow);
    write(READER, { ...DEFAULT_READER, ...b.reader });
    return;
  }
  write(FAV, [...new Set([...read<number[]>(FAV, EMPTY_NUMS), ...b.fav])].slice(0, 500));
  const mine = new Map(read<HistoryEntry[]>(HIST, EMPTY_HIST).map((h) => [h.id, h]));
  for (const h of b.history) {
    const cur = mine.get(h.id);
    if (!cur || h.at > cur.at) mine.set(h.id, { ...h, done: [...new Set([...(cur?.done ?? []), ...h.done])].sort((x, y) => x - y) });
  }
  write(HIST, [...mine.values()].sort((x, y) => y.at - x.at).slice(0, 120));
  const follows = read<Follow[]>(FOLLOW, EMPTY_FOLLOWS);
  write(FOLLOW, [...follows, ...b.follow.filter((f) => !follows.some((x) => x.id === f.id))].slice(0, MAX_FOLLOWS));
  write(READER, { ...read<ReaderPrefs>(READER, DEFAULT_READER), ...b.reader });
}
