"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Columns2, Maximize2, Minimize2, MoveHorizontal, MoveVertical, RotateCcw, RotateCw, ScrollText, Settings2, X,
} from "lucide-react";
import { DEFAULT_READER, recordProgress, useReaderPrefs } from "@/lib/library";
import { readHref, workHref } from "@/lib/format";

export interface ReaderPage {
  n: number;
  src: string;
  w: number;
  h: number;
}
interface Props {
  work: { publicId: number; slug: string; title: string };
  chapter: { number: number; title: string | null };
  pages: ReaderPage[];
  prev: number | null;
  next: number | null;
  chapters: { number: number }[];
  startPage: number;
}

// scroll mode renders real <img>s only near the reader, so a 2,000-page set never holds 2,000 decoded images
const BEFORE = 6;
const AFTER = 18;

export function Reader({ work, chapter, pages, prev, next, chapters, startPage }: Props) {
  const router = useRouter();
  const total = pages.length;
  const { prefs, set } = useReaderPrefs();
  const scrollMode = prefs.mode === "scroll";
  const [page, setPage] = useState(Math.min(Math.max(startPage, 1), total + 1));
  const [ui, setUi] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [full, setFull] = useState(false);
  const [bust, setBust] = useState<Record<number, number>>({});
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const markFailed = (n: number, bad: boolean) =>
    setFailed((f) => {
      if (f.has(n) === bad) return f;
      const next = new Set(f);
      if (bad) next.add(n);
      else next.delete(n);
      return next;
    });
  const lastY = useRef(0);
  const pointer = useRef<{ x: number; y: number; t: number } | null>(null);
  const pagedBox = useRef<HTMLDivElement>(null);
  const at = Math.min(page, total); // the "end of chapter" card counts as page total + 1

  /* ───────── progress ───────── */
  useEffect(() => {
    const t = setTimeout(() => recordProgress(work.publicId, chapter.number, at, total), 500);
    return () => clearTimeout(t);
  }, [at, work.publicId, chapter.number, total]);
  useEffect(() => {
    const flush = () => recordProgress(work.publicId, chapter.number, Math.min(pageRef.current, total), total);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [work.publicId, chapter.number, total]);
  const pageRef = useRef(page);
  pageRef.current = page;

  // keep a refreshable position in the URL without adding history entries
  useEffect(() => {
    const t = setTimeout(() => window.history.replaceState(window.history.state, "", `?p=${at}`), 800);
    return () => clearTimeout(t);
  }, [at]);

  /* ───────── navigation ───────── */
  const jumpTo = useCallback(
    (n: number, smooth = false) => {
      const target = Math.min(Math.max(n, 1), total + 1);
      setPage(target);
      if (scrollMode) document.getElementById(target > total ? "end" : `pg-${target}`)?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    },
    [scrollMode, total],
  );

  const goChapter = useCallback((n: number | null, last = false) => n != null && router.push(readHref(work.publicId, n, last ? 99999 : undefined)), [router, work.publicId]);

  /** +1 = forward in reading order, -1 = back. Crosses chapter boundaries. */
  const step = useCallback(
    (dir: 1 | -1) => {
      if (dir === 1) {
        if (page > total) return goChapter(next);
        return jumpTo(page + 1);
      }
      if (page <= 1) return goChapter(prev, true);
      return jumpTo(page - 1);
    },
    [page, total, jumpTo, goChapter, next, prev],
  );

  // start position (scroll mode): place the page before the first paint
  useLayoutEffect(() => {
    if (scrollMode && startPage > 1) document.getElementById(startPage > total ? "end" : `pg-${startPage}`)?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switching modes keeps the page
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    if (scrollMode) requestAnimationFrame(() => document.getElementById(`pg-${Math.min(pageRef.current, total)}`)?.scrollIntoView({ block: "start" }));
  }, [scrollMode, total]);

  /* ───────── scroll mode: which page is in the middle of the screen ───────── */
  useEffect(() => {
    if (!scrollMode) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setPage(Number((e.target as HTMLElement).dataset.n));
      },
      { rootMargin: "-49% 0px -49% 0px" },
    );
    document.querySelectorAll("[data-n]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [scrollMode, total, prefs.width]);

  // hide the bars while reading down, bring them back on scroll up
  useEffect(() => {
    if (!scrollMode) return;
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (Math.abs(dy) > 12) {
        setUi(dy < 0 || y < 120);
        lastY.current = y;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [scrollMode]);

  /* ───────── paged mode: preload neighbours, reset scroll ───────── */
  useEffect(() => {
    if (scrollMode) return;
    pagedBox.current?.scrollTo({ top: 0 });
    for (const n of [page + 1, page + 2, page + 3, page - 1]) {
      const p = pages[n - 1];
      if (p) new Image().src = p.src;
    }
  }, [scrollMode, page, pages]);

  /* ───────── keyboard ───────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const fwd = prefs.rtl && !scrollMode ? "ArrowLeft" : "ArrowRight";
      const back = prefs.rtl && !scrollMode ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd || (e.key === "ArrowRight" && scrollMode)) { e.preventDefault(); step(1); }
      else if (e.key === back || (e.key === "ArrowLeft" && scrollMode)) { e.preventDefault(); step(-1); }
      else if (!scrollMode && (e.key === " " || e.key === "PageDown")) { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (!scrollMode && e.key === "PageUp") { e.preventDefault(); step(-1); }
      else if (e.key === "Home") { e.preventDefault(); jumpTo(1); }
      else if (e.key === "End") { e.preventDefault(); jumpTo(total); }
      else if (e.key === "f") toggleFull();
      else if (e.key === "m") set({ mode: scrollMode ? "paged" : "scroll" });
      else if (e.key === "s") setSheet((s) => !s);
      else if (e.key === "Escape") setSheet(false);
      else if (e.key === "[") goChapter(prev);
      else if (e.key === "]") goChapter(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, jumpTo, prefs.rtl, scrollMode, total, prev, next]);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  /* ───────── paged mode: tap zones and swipes ───────── */
  const onPointerDown = (e: React.PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = pointer.current;
    pointer.current = null;
    if (!s || (e.target as HTMLElement).closest("button,a,input,select")) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      // a swipe towards the left moves forward in left-to-right reading
      const forward = prefs.rtl ? dx > 0 : dx < 0;
      return step(forward ? 1 : -1);
    }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - s.t < 500) {
      const x = e.clientX / window.innerWidth;
      if (x < 0.3) step(prefs.rtl ? 1 : -1);
      else if (x > 0.7) step(prefs.rtl ? -1 : 1);
      else setUi((u) => !u);
    }
  };

  const cur = pages[at - 1];
  const barCls = `fixed inset-x-0 z-30 transition duration-300 ${ui ? "opacity-100" : "pointer-events-none opacity-0"}`;

  return (
    <div data-theme="dark" className="min-h-dvh bg-black text-white" style={{ ["--reader-dim" as string]: String(1 - prefs.dim / 100) }}>
      <p className="sr-only" aria-live="polite">
        Page {at} of {total}
      </p>

      {/* ───────── top bar ───────── */}
      <header className={`${barCls} top-0 ${ui ? "translate-y-0" : "-translate-y-3"}`}>
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 border-b border-white/10 bg-black/80 px-2 backdrop-blur-xl sm:mt-2 sm:rounded-2xl sm:border">
          <Link href={workHref(work)} className="btn-icon !text-white/80 hover:!bg-white/10" aria-label="Back to details">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold leading-tight">{work.title}</p>
            <p className="truncate text-xs text-white/60">
              {chapters.length > 1 ? `Chapter ${chapter.number}${chapter.title ? ` · ${chapter.title}` : ""}` : "One-shot"} · page {at}/{total}
            </p>
          </div>
          <button type="button" onClick={() => set({ mode: scrollMode ? "paged" : "scroll" })} className="btn-icon !text-white/80 hover:!bg-white/10" aria-label={scrollMode ? "Switch to paged mode" : "Switch to scroll mode"} title="Mode (M)">
            {scrollMode ? <Columns2 className="h-5 w-5" /> : <ScrollText className="h-5 w-5" />}
          </button>
          <button type="button" onClick={toggleFull} className="btn-icon hidden !text-white/80 hover:!bg-white/10 sm:inline-flex" aria-label={full ? "Exit fullscreen" : "Fullscreen"} title="Fullscreen (F)">
            {full ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
          <button type="button" onClick={() => setSheet(true)} className="btn-icon !text-white/80 hover:!bg-white/10" aria-label="Reader settings" title="Settings (S)">
            <Settings2 className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ───────── pages ───────── */}
      {scrollMode ? (
        <div className="mx-auto" style={{ maxWidth: prefs.width, filter: `brightness(var(--reader-dim))` }} onClick={(e) => !(e.target as HTMLElement).closest("button,a") && setUi((u) => !u)}>
          {pages.map((p) => {
            const near = p.n >= at - BEFORE && p.n <= at + AFTER;
            return (
              <div key={p.n} id={`pg-${p.n}`} data-n={p.n} className="relative w-full bg-neutral-950" style={{ aspectRatio: `${p.w || 800} / ${p.h || 1200}` }}>
                {near && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bust[p.n] ? `${p.src}?r=${bust[p.n]}` : p.src}
                    alt={`Page ${p.n}`}
                    width={p.w || undefined}
                    height={p.h || undefined}
                    loading={p.n <= at + 2 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    className="absolute inset-0 h-full w-full select-none"
                    onError={() => markFailed(p.n, true)}
                    onLoad={() => markFailed(p.n, false)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setBust((b) => ({ ...b, [p.n]: (b[p.n] ?? 0) + 1 }))}
                  className={`absolute inset-0 grid place-items-center text-sm font-semibold text-white/70 transition ${failed.has(p.n) ? "z-10 opacity-100" : "pointer-events-none -z-0 opacity-0 focus-visible:z-10 focus-visible:opacity-100"}`}
                  aria-label={`Reload page ${p.n}`}
                >
                  <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3">
                    <RotateCw className="h-5 w-5" /> Page {p.n} failed to load. Tap to retry
                  </span>
                </button>
              </div>
            );
          })}
          <EndCard id="end" work={work} chapter={chapter.number} next={next} prev={prev} onNext={() => goChapter(next)} />
        </div>
      ) : (
        <div
          ref={pagedBox}
          className="relative flex h-dvh touch-pan-y select-none items-start justify-center overflow-y-auto overflow-x-hidden"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          style={{ filter: `brightness(var(--reader-dim))` }}
        >
          {page > total ? (
            <div className="grid min-h-dvh w-full place-items-center">
              <EndCard work={work} chapter={chapter.number} next={next} prev={prev} onNext={() => goChapter(next)} />
            </div>
          ) : (
            cur && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${at}-${bust[at] ?? 0}`}
                src={bust[at] ? `${cur.src}?r=${bust[at]}` : cur.src}
                alt={`Page ${at}`}
                width={cur.w || undefined}
                height={cur.h || undefined}
                decoding="async"
                draggable={false}
                className={prefs.fit === "height" ? "m-auto max-h-dvh w-auto max-w-full object-contain" : "mx-auto h-auto w-full max-w-[1100px]"}
              />
            )
          )}
        </div>
      )}

      {/* ───────── bottom bar ───────── */}
      <footer className={`${barCls} bottom-0 pb-safe ${ui ? "translate-y-0" : "translate-y-3"}`}>
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-1 border-t border-white/10 bg-black/80 px-2 backdrop-blur-xl sm:mb-2 sm:rounded-2xl sm:border">
          <button type="button" disabled={prev == null} onClick={() => goChapter(prev)} className="btn-icon !text-white/80 hover:!bg-white/10 disabled:opacity-30" aria-label="Previous chapter" title="Previous chapter ([)">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <input
            type="range"
            min={1}
            max={total}
            value={at}
            dir={!scrollMode && prefs.rtl ? "rtl" : "ltr"}
            onChange={(e) => jumpTo(Number(e.target.value))}
            aria-label="Page"
            className="h-11 min-w-0 flex-1 cursor-pointer accent-[rgb(var(--accent))]"
          />
          <span className="w-16 shrink-0 text-center text-xs font-semibold tabular-nums text-white/80">
            {at} / {total}
          </span>
          <button type="button" disabled={next == null} onClick={() => goChapter(next)} className="btn-icon !text-white/80 hover:!bg-white/10 disabled:opacity-30" aria-label="Next chapter" title="Next chapter (])">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </footer>

      {/* ───────── settings ───────── */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Reader settings">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade" onClick={() => setSheet(false)} aria-label="Close settings" />
          <div className="pb-safe relative z-10 max-h-[88dvh] w-full max-w-md space-y-6 overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-900 p-5 shadow-2xl animate-rise sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Reader settings</h2>
              <button className="btn-icon !text-white/70 hover:!bg-white/10" onClick={() => setSheet(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <Group label="Reading mode">
              <Seg value={prefs.mode} onChange={(v) => set({ mode: v })} options={[{ v: "scroll", l: "Scroll", I: ScrollText }, { v: "paged", l: "Paged", I: Columns2 }]} />
            </Group>
            {!scrollMode && (
              <>
                <Group label="Direction">
                  <Seg value={prefs.rtl ? "rtl" : "ltr"} onChange={(v) => set({ rtl: v === "rtl" })} options={[{ v: "ltr", l: "Left to right" }, { v: "rtl", l: "Right to left" }]} />
                </Group>
                <Group label="Fit page to">
                  <Seg value={prefs.fit} onChange={(v) => set({ fit: v })} options={[{ v: "width", l: "Width", I: MoveHorizontal }, { v: "height", l: "Height", I: MoveVertical }]} />
                </Group>
              </>
            )}
            {scrollMode && (
              <Group label={`Page width: ${prefs.width}px`}>
                <input type="range" min={480} max={1400} step={20} value={prefs.width} onChange={(e) => set({ width: Number(e.target.value) })} className="h-11 w-full accent-[rgb(var(--accent))]" aria-label="Page width" />
              </Group>
            )}
            <Group label={`Dim: ${prefs.dim}%`}>
              <input type="range" min={0} max={70} step={5} value={prefs.dim} onChange={(e) => set({ dim: Number(e.target.value) })} className="h-11 w-full accent-[rgb(var(--accent))]" aria-label="Dim" />
            </Group>
            {chapters.length > 1 && (
              <Group label="Chapter">
                <select value={chapter.number} onChange={(e) => { setSheet(false); router.push(readHref(work.publicId, Number(e.target.value))); }} className="h-11 w-full rounded-xl border border-white/15 bg-neutral-800 px-3 text-sm">
                  {chapters.map((c) => (
                    <option key={c.number} value={c.number}>
                      Chapter {c.number}
                    </option>
                  ))}
                </select>
              </Group>
            )}
            <button className="btn-ghost w-full !text-white/60" onClick={() => set(DEFAULT_READER)}>
              <RotateCcw className="h-4 w-4" /> Reset to defaults
            </button>
            <p className="hidden text-xs leading-relaxed text-white/45 sm:block">
              Keys: arrows turn pages, <kbd>Space</kbd> next, <kbd>M</kbd> mode, <kbd>F</kbd> fullscreen, <kbd>[</kbd> <kbd>]</kbd> chapters, <kbd>S</kbd> settings.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function EndCard({ id, work, chapter, next, prev, onNext }: { id?: string; work: Props["work"]; chapter: number; next: number | null; prev: number | null; onNext: () => void }) {
  return (
    <section id={id} className="mx-auto grid min-h-[70dvh] max-w-sm place-items-center px-6 py-24 text-center" aria-label="End of chapter">
      <div className="space-y-5">
        <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-accent">{next != null ? `End of chapter ${chapter}` : "The end"}</p>
        <h2 className="font-display text-2xl font-extrabold leading-tight">{next != null ? "Keep going?" : "You reached the last page"}</h2>
        <div className="flex flex-col gap-2.5">
          {next != null && (
            <button type="button" onClick={onNext} className="btn-primary h-12">
              Next chapter <ChevronRight className="h-5 w-5" />
            </button>
          )}
          <Link href={workHref(work)} className="btn-soft h-12 !bg-white/10 !text-white hover:!bg-white/15">
            Back to details
          </Link>
          {prev != null && next == null && (
            <Link href={readHref(work.publicId, prev)} className="btn-ghost h-12 !text-white/60">
              Previous chapter
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-wider text-white/50">{label}</p>
      {children}
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string; I?: React.ComponentType<{ className?: string }> }[] }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-white/10 p-1" role="radiogroup">
      {options.map(({ v, l, I }) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${value === v ? "bg-accent-fill text-white shadow" : "text-white/70 hover:text-white"}`}>
          {I && <I className="h-4 w-4" />}
          {l}
        </button>
      ))}
    </div>
  );
}
