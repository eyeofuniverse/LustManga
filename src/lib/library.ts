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
}
export const DEFAULT_READER: ReaderPrefs = { mode: "auto", rtl: false, spread: "auto", width: 860, dim: 0 };
const READER = "lm:reader";

export function useReaderPrefs() {
  const stored = useSyncExternalStore(subscribe, () => read<ReaderPrefs>(READER, DEFAULT_READER), () => DEFAULT_READER);
  // earlier versions stored "paged" (one page at a time), which is what book mode is now
  const prefs = (stored.mode as string) === "paged" ? { ...stored, mode: "book" as const } : stored;
  const set = useCallback((patch: Partial<ReaderPrefs>) => write(READER, { ...read<ReaderPrefs>(READER, DEFAULT_READER), ...patch }), []);
  return { prefs: { ...DEFAULT_READER, ...prefs }, set };
}
