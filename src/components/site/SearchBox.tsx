"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, Clock, Search, Tag, User, X } from "lucide-react";
import { useRecentSearches } from "@/lib/library";
import type { SuggestResult } from "@/lib/types";
import { cdn } from "@/lib/cdn";
import { langLabel, tagHref, workHref } from "@/lib/format";

interface Row {
  key: string;
  href: string;
  label: string;
  sub?: string;
  kind: "search" | "tag" | "artist" | "work" | "recent";
  cover?: string | null;
}

/** Header search with instant suggestions. Full-width bar on phones, inline on larger screens. Press "/" to focus. */
export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [data, setData] = useState<SuggestResult | null>(null);
  const [active, setActive] = useState(-1);

  const recent = useRecentSearches();
  const term = q.trim();
  const rows: Row[] = [];
  // an empty box offers the last few searches
  if (term.length === 0) for (const r of recent.items) rows.push({ key: `r${r}`, href: `/search?q=${encodeURIComponent(r)}`, label: r, sub: "Recent search", kind: "recent" });
  if (term.length >= 1) rows.push({ key: "q", href: `/search?q=${encodeURIComponent(term)}`, label: `Search for "${term}"`, kind: "search" });
  for (const t of data?.tags ?? [])
    rows.push({
      key: `t${t.type}${t.slug}`,
      href: tagHref(t.type, t.slug),
      label: t.name,
      sub: `${t.type.toLowerCase()} · ${t.count.toLocaleString()}`,
      kind: t.type === "ARTIST" || t.type === "GROUP" ? "artist" : "tag",
    });
  for (const w of data?.works ?? [])
    rows.push({ key: `w${w.publicId}`, href: workHref(w), label: w.title, sub: langLabel(w.language), kind: "work", cover: w.coverKey });

  // fetch suggestions (debounced, cancellable)
  useEffect(() => {
    if (term.length < 2) {
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (r.ok) setData(await r.json());
      } catch {
        /* aborted or offline: keep the old list */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);

  // "/" focuses the search from anywhere (unless already typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setMobile(true);
        setOpen(true);
        requestAnimationFrame(() => input.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // click / tap outside closes
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setMobile(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setMobile(false);
      input.current?.blur();
      const m = /^\/search\?q=(.*)$/.exec(href);
      if (m) recent.add(decodeURIComponent(m[1]));
      router.push(href);
    },
    [router, recent],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % Math.max(rows.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? rows.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && rows[active]) go(rows[active].href);
      else if (term) go(`/search?q=${encodeURIComponent(term)}`);
    } else if (e.key === "Escape") {
      setOpen(false);
      setMobile(false);
      input.current?.blur();
    }
  };

  const showList = open && rows.length > 0;

  return (
    <>
      <button
        type="button"
        className="btn-icon md:hidden"
        aria-label="Search"
        onClick={() => {
          setMobile(true);
          setOpen(true);
          requestAnimationFrame(() => input.current?.focus());
        }}
      >
        <Search className="h-5 w-5" />
      </button>

      <div
        ref={wrap}
        className={
          mobile
            ? "absolute inset-x-0 top-0 z-50 flex h-14 items-center gap-2 bg-bg px-3 md:relative md:z-auto md:h-auto md:w-[min(26rem,34vw)] md:bg-transparent md:px-0"
            : "relative hidden md:block md:w-[min(26rem,34vw)]"
        }
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Search titles, tags, artists"
            aria-label="Search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            className="h-11 w-full rounded-xl border border-line bg-surface-2/70 pl-10 pr-10 text-sm text-text placeholder:text-muted/80 transition focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button type="button" aria-label="Clear search" className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-text" onClick={() => { setQ(""); setData(null); input.current?.focus(); }}>
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 text-[11px] font-medium text-muted md:block">/</kbd>
          )}
        </div>
        {mobile && (
          <button type="button" className="btn-ghost px-3 md:hidden" onClick={() => { setMobile(false); setOpen(false); }}>
            Cancel
          </button>
        )}

        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(70vh,34rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-card animate-pop"
          >
            {rows.map((r, i) => (
              <li key={r.key} role="option" aria-selected={i === active} id={`${listId}-${i}`} className="relative">
                <a
                  href={r.href}
                  onClick={(e) => {
                    e.preventDefault();
                    go(r.href);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm ${r.kind === "recent" ? "pr-11" : ""} ${i === active ? "bg-surface-2" : ""}`}
                >
                  {r.kind === "work" ? (
                    <span className="h-12 w-8 shrink-0 overflow-hidden rounded-md bg-surface-3">
                      {r.cover && <img src={cdn(r.cover)!} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    </span>
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                      {r.kind === "search" ? <Search className="h-4 w-4" /> : r.kind === "recent" ? <Clock className="h-4 w-4" /> : r.kind === "artist" ? <User className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.label}</span>
                    {r.sub && <span className="block truncate text-xs capitalize text-muted">{r.sub}</span>}
                  </span>
                  {r.kind === "work" ? <BookOpen className="h-4 w-4 shrink-0 text-muted" /> : r.kind === "recent" ? null : <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" />}
                </a>
                {r.kind === "recent" && (
                  <button type="button" aria-label={`Remove "${r.label}" from recent searches`} onClick={() => recent.remove(r.label)} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-text">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
