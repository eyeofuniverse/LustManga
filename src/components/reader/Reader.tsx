"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Hand, Maximize2, Minimize2, MousePointerClick, Pause, Play, RotateCcw, RotateCw, ScrollText, Settings2, Sparkles, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { DEFAULT_READER, recordProgress, useReaderPrefs } from "@/lib/library";
import { readHref, workHref } from "@/lib/format";
import { buildSlides, isLongStrip, pageOfSlide, slideOfPage, wantsSpread } from "@/lib/spreads";
import { BookStage, type BookHandle } from "./BookStage";
import type { ReaderPage } from "./types";
import { DownloadChapter } from "@/components/work/DownloadChapter";

export type { ReaderPage };
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
const HINT_KEY = "lm:reader-hint";

/** what sits behind the pages, by the "Background" setting */
const BACKGROUNDS: Record<string, string> = {
  black: "radial-gradient(120% 90% at 50% 40%, #1b1b24 0%, #0a0a0e 70%, #050507 100%)",
  gray: "#2b2b33",
  sepia: "#efe3c8",
  white: "#f4f4f6",
};
/** auto-play: how long each page stays in book mode (ms), and how fast the page scrolls in scroll mode (px/s) */
const AUTO_TURN_MS = { 1: 12_000, 2: 6_000, 3: 3_000 } as const;
const AUTO_SCROLL_PX = { 1: 40, 2: 90, 3: 170 } as const;

export function Reader({ work, chapter, pages, prev, next, chapters, startPage }: Props) {
  const router = useRouter();
  const total = pages.length;
  const { prefs, set } = useReaderPrefs();
  const strip = useMemo(() => isLongStrip(pages), [pages]);
  // "auto" reads like a book, except tall webtoon strips which only make sense scrolling
  const scrollMode = prefs.mode === "scroll" || (prefs.mode === "auto" && strip);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const spread = !scrollMode && prefs.spread === "auto" && wantsSpread(vp.w, vp.h);
  const slides = useMemo(() => buildSlides(pages, spread, prefs.coverAlone), [pages, spread, prefs.coverAlone]);
  const [playing, setPlaying] = useState(false);

  const [page, setPage] = useState(Math.min(Math.max(startPage, 1), total + 1));
  const [ui, setUi] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [full, setFull] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [hint, setHint] = useState(false);
  const [toast, setToast] = useState(false);
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
  const book = useRef<BookHandle>(null);
  const headerEl = useRef<HTMLElement>(null);
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const focusBars = useRef(false);
  useEffect(() => {
    if (!ui || !focusBars.current) return;
    focusBars.current = false;
    // the bars fade in over 300ms and "visibility" only reads as visible a moment after that starts
    const t = setTimeout(() => headerEl.current?.querySelector<HTMLElement>("a,button")?.focus(), 60);
    return () => clearTimeout(t);
  }, [ui]);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const at = Math.min(page, total); // the "end of chapter" card counts as page total + 1
  const slideIdx = slideOfPage(slides, page);
  const slide = slides[slideIdx];
  const shownPages = slide?.kind === "pages" ? slide.pages : [at];
  const label = shownPages.length > 1 ? `${shownPages[0]}–${shownPages[shownPages.length - 1]}` : String(at);

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

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

  /* ───────── first-time hint, chrome that gets out of the way ───────── */
  useEffect(() => {
    if (scrollMode) return;
    try {
      if (!localStorage.getItem(HINT_KEY)) setHint(true);
    } catch {
      /* storage blocked: no hint */
    }
  }, [scrollMode]);
  const dismissHint = useCallback(() => {
    setHint(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(dismissHint, 7000);
    return () => clearTimeout(t);
  }, [hint, dismissHint]);

  // a book gets out of the way: the bars tuck themselves away a moment after you open it
  useEffect(() => {
    if (scrollMode || hint) return;
    const t = setTimeout(() => setUi(false), 3200);
    return () => clearTimeout(t);
  }, [scrollMode, hint]);

  // a quick "12 / 40" when a page turns while the bars are hidden
  const firstTurn = useRef(true);
  useEffect(() => {
    if (firstTurn.current) {
      firstTurn.current = false;
      return;
    }
    setToast(true);
    const t = setTimeout(() => setToast(false), 1100);
    return () => clearTimeout(t);
  }, [label]);

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
      if (!scrollMode) return book.current?.go(dir);
      if (dir === 1) {
        if (page > total) return goChapter(next);
        return jumpTo(page + 1);
      }
      if (page <= 1) return goChapter(prev, true);
      return jumpTo(page - 1);
    },
    [scrollMode, page, total, jumpTo, goChapter, next, prev],
  );

  // start position (scroll mode): place the page before the first paint
  useLayoutEffect(() => {
    if (!scrollMode || startPage <= 1) return;
    const target = () => document.getElementById(startPage > total ? "end" : `pg-${startPage}`);
    target()?.scrollIntoView({ block: "start" });
    // Next scrolls a freshly navigated page back to the top just after it mounts, which would undo the line above.
    // Put the page back once that has happened, unless the visitor has already started scrolling themselves.
    let touched = false;
    const mark = () => (touched = true);
    window.addEventListener("wheel", mark, { passive: true, once: true });
    window.addEventListener("touchmove", mark, { passive: true, once: true });
    window.addEventListener("keydown", mark, { once: true });
    const fix = () => {
      const el = target();
      if (!touched && el && Math.abs(el.getBoundingClientRect().top) > 40) el.scrollIntoView({ block: "start" });
    };
    const timers = [setTimeout(fix, 60), setTimeout(fix, 300), setTimeout(fix, 900)];
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchmove", mark);
      window.removeEventListener("keydown", mark);
    };
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

  /* ───────── auto-play: turns the page every few seconds, or scrolls on its own ───────── */
  useEffect(() => setPlaying(false), [scrollMode]);
  useEffect(() => {
    if (!playing || scrollMode || sheet || hint || zoomed) return;
    if (slideIdx >= slides.length - 1) return setPlaying(false); // reached the end card
    // each turn restarts this timer (slideIdx changes), so turning by hand simply postpones the next automatic one
    const t = setTimeout(() => book.current?.go(1, false), AUTO_TURN_MS[prefs.autoSpeed]);
    return () => clearTimeout(t);
  }, [playing, scrollMode, sheet, hint, zoomed, slideIdx, slides.length, prefs.autoSpeed]);
  useEffect(() => {
    if (!playing || !scrollMode || sheet) return;
    const pxPerSecond = AUTO_SCROLL_PX[prefs.autoSpeed];
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      carry += (pxPerSecond * (now - last)) / 1000;
      last = now;
      const step = Math.floor(carry);
      if (step >= 1) {
        carry -= step;
        window.scrollBy(0, step);
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) return setPlaying(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // taking over with the wheel or a finger hands control back
    const stop = () => setPlaying(false);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
  }, [playing, scrollMode, sheet, prefs.autoSpeed]);

  /* ───────── keyboard ───────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Space / Enter on a focused button or link is that control's own action, not "next page"
      if ((e.key === " " || e.key === "Enter") && (el.tagName === "BUTTON" || el.tagName === "A")) return;
      // with the bars tucked away, Tab brings them back and puts the focus on the first control
      if (e.key === "Tab" && !uiRef.current && !sheetRef.current) {
        e.preventDefault();
        focusBars.current = true; // focus once the bars are actually visible again (see the effect below)
        setUi(true);
        return;
      }
      // a dialog is open: the page behind it must not turn
      if (sheetRef.current) {
        if (e.key === "Escape" || e.key === "s") setSheet(false);
        return;
      }
      if (hint) dismissHint();
      const fwd = prefs.rtl && !scrollMode ? "ArrowLeft" : "ArrowRight";
      const back = prefs.rtl && !scrollMode ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd || (e.key === "ArrowRight" && scrollMode)) { e.preventDefault(); step(1); }
      else if (e.key === back || (e.key === "ArrowLeft" && scrollMode)) { e.preventDefault(); step(-1); }
      else if (!scrollMode && (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ")) { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (!scrollMode && (e.key === "ArrowUp" || e.key === "PageUp")) { e.preventDefault(); step(-1); }
      else if (e.key === "Home") { e.preventDefault(); jumpTo(1); }
      else if (e.key === "End") { e.preventDefault(); jumpTo(total); }
      else if (e.key === "f") toggleFull();
      else if (e.key === "m") set({ mode: scrollMode ? "book" : "scroll" });
      else if (e.key === "z" && !scrollMode) book.current?.toggleZoom();
      else if (e.key === "p") setPlaying((p) => !p);
      else if (e.key === "s") setSheet((s) => !s);
      else if (e.key === "Escape") setSheet(false);
      else if (e.key === "[") goChapter(prev);
      else if (e.key === "]") goChapter(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, jumpTo, prefs.rtl, scrollMode, total, prev, next, hint]);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // hidden bars leave the tab order and the accessibility tree too (visibility), not just the eye
  const barCls = `fixed inset-x-0 z-30 transition-[opacity,transform,visibility] duration-300 ${ui ? "visible opacity-100" : "invisible pointer-events-none opacity-0"}`;
  const endCard = <EndCard work={work} chapter={chapter.number} next={next} prev={prev} onNext={() => goChapter(next)} />;

  return (
    <div data-theme="dark" className="min-h-dvh text-white" style={{ ["--reader-dim" as string]: String(1 - prefs.dim / 100), background: scrollMode ? (prefs.bg === "black" ? "#000" : BACKGROUNDS[prefs.bg]) : "#000" }}>
      <h1 className="sr-only">
        {work.title}
        {chapters.length > 1 ? `, chapter ${chapter.number}` : ""}
      </h1>
      <p className="sr-only" aria-live="polite">
        Page {label} of {total}
      </p>

      {/* ───────── top bar ───────── */}
      <header ref={headerEl} className={`${barCls} top-0 ${ui ? "translate-y-0" : "-translate-y-3"}`}>
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 border-b border-white/10 bg-black/80 px-2 backdrop-blur-xl sm:mt-2 sm:rounded-2xl sm:border">
          <Link href={workHref(work)} className="btn-icon !text-white/80 hover:!bg-white/10" aria-label="Back to details">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold leading-tight">{work.title}</p>
            <p className="truncate text-xs text-white/60">
              {chapters.length > 1 ? `Chapter ${chapter.number}${chapter.title ? ` · ${chapter.title}` : ""}` : "One-shot"} · page {label}/{total}
            </p>
          </div>
          <button type="button" onClick={() => setPlaying((p) => !p)} className="btn-icon !text-white/80 hover:!bg-white/10" aria-pressed={playing} aria-label={playing ? "Pause auto-play" : scrollMode ? "Start auto-scroll" : "Start auto-play"} title="Auto-play (P)">
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          {!scrollMode && (
            <button type="button" onClick={() => book.current?.toggleZoom()} className="btn-icon !text-white/80 hover:!bg-white/10" aria-label={zoomed ? "Reset zoom" : "Zoom in"} title="Zoom (Z)">
              {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
            </button>
          )}
          <button type="button" onClick={() => set({ mode: scrollMode ? "book" : "scroll" })} className="btn-icon !text-white/80 hover:!bg-white/10" aria-label={scrollMode ? "Switch to book mode" : "Switch to scroll mode"} title="Mode (M)">
            {scrollMode ? <BookOpen className="h-5 w-5" /> : <ScrollText className="h-5 w-5" />}
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
          <section id="end" className="grid min-h-[70dvh] place-items-center" aria-label="End of chapter">
            {endCard}
          </section>
        </div>
      ) : (
        <BookStage
          ref={book}
          slides={slides}
          pages={pages}
          index={slideIdx}
          rtl={prefs.rtl}
          brightness={1 - prefs.dim / 100}
          background={BACKGROUNDS[prefs.bg]}
          endCard={endCard}
          onIndex={(i) => {
            setPage(pageOfSlide(slides, i, total));
            setUi(false);
          }}
          onEdge={(dir) => (dir === 1 ? goChapter(next) : goChapter(prev, true))}
          onToggleUi={() => setUi((u) => !u)}
          onZoomChange={setZoomed}
        />
      )}

      {/* a hairline of progress that stays visible while the bars are away */}
      {!scrollMode && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[3px] bg-white/10" dir={prefs.rtl ? "rtl" : "ltr"}>
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${(Math.min(shownPages[shownPages.length - 1] ?? at, total) / total) * 100}%` }} />
        </div>
      )}
      {!scrollMode && !ui && !sheet && (
        <div aria-hidden="true" className={`pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center transition duration-300 ${toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
          <span className="rounded-full bg-black/80 px-3.5 py-1.5 text-sm font-bold tabular-nums text-white shadow-lg backdrop-blur">
            {label} / {total}
          </span>
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
            {label} / {total}
          </span>
          <button type="button" disabled={next == null} onClick={() => goChapter(next)} className="btn-icon !text-white/80 hover:!bg-white/10 disabled:opacity-30" aria-label="Next chapter" title="Next chapter (])">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </footer>

      {/* ───────── first-time hint ───────── */}
      {hint && !scrollMode && (
        <button type="button" onClick={dismissHint} aria-label="Dismiss reading tips" className="fixed inset-0 z-40 grid place-items-center bg-black/80 px-6 text-white backdrop-blur-sm animate-fade">
          <span className="block max-w-xs space-y-6 text-center">
            <span className="block font-display text-xl font-extrabold">Read it like a book</span>
            <span className="grid gap-4 text-left text-sm">
              <Tip icon={<Hand className="h-5 w-5" />} title="Swipe to turn the page" body={prefs.rtl ? "Right to left, like manga." : "Drag the page left or right."} />
              <Tip icon={<MousePointerClick className="h-5 w-5" />} title="Tap the edges" body="The middle brings back the menu." />
              <Tip icon={<ZoomIn className="h-5 w-5" />} title="Pinch or double-tap" body="Zoom in on the details." />
            </span>
            <span className="inline-block rounded-full bg-accent-fill px-5 py-2.5 text-sm font-bold">Got it</span>
          </span>
        </button>
      )}

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
              <Seg
                value={prefs.mode}
                onChange={(v) => set({ mode: v })}
                options={[{ v: "auto", l: "Auto", I: Sparkles }, { v: "book", l: "Book", I: BookOpen }, { v: "scroll", l: "Scroll", I: ScrollText }]}
              />
              <p className="text-xs leading-relaxed text-white/50">
                {prefs.mode === "auto" ? `Auto reads like a book and scrolls long webtoon strips.${strip ? " This one is a strip, so it scrolls." : ""}` : prefs.mode === "book" ? "Swipe to turn pages, like a printed book." : "One long page that you scroll."}
              </p>
            </Group>
            {!scrollMode && (
              <>
                <Group label="Direction">
                  <Seg value={prefs.rtl ? "rtl" : "ltr"} onChange={(v) => set({ rtl: v === "rtl" })} options={[{ v: "ltr", l: "Left to right" }, { v: "rtl", l: "Right to left" }]} />
                </Group>
                <Group label="Two-page spreads">
                  <Seg value={prefs.spread} onChange={(v) => set({ spread: v })} options={[{ v: "auto", l: "On wide screens" }, { v: "off", l: "Off" }]} />
                </Group>
                {prefs.spread === "auto" && (
                  <Group label="First page">
                    <Seg value={prefs.coverAlone ? "alone" : "paired"} onChange={(v) => set({ coverAlone: v === "alone" })} options={[{ v: "alone", l: "On its own (cover)" }, { v: "paired", l: "Paired with page 2" }]} />
                  </Group>
                )}
              </>
            )}
            {scrollMode && (
              <Group label={`Page width: ${prefs.width}px`}>
                <input type="range" min={480} max={1400} step={20} value={prefs.width} onChange={(e) => set({ width: Number(e.target.value) })} className="h-11 w-full accent-[rgb(var(--accent))]" aria-label="Page width" />
              </Group>
            )}
            <Group label="Background">
              <Seg value={prefs.bg} onChange={(v) => set({ bg: v })} options={[{ v: "black", l: "Black" }, { v: "gray", l: "Gray" }, { v: "sepia", l: "Sepia" }, { v: "white", l: "White" }]} />
            </Group>
            <Group label="Auto-play speed">
              <Seg value={String(prefs.autoSpeed)} onChange={(v) => set({ autoSpeed: Number(v) as 1 | 2 | 3 })} options={[{ v: "1", l: "Slow" }, { v: "2", l: "Medium" }, { v: "3", l: "Fast" }]} />
              <p className="text-xs text-white/50">{scrollMode ? "Scrolls by itself. Touch or scroll to take over." : "Turns the page for you. Press P to start or pause."}</p>
            </Group>
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
            <Group label="Offline">
              <DownloadChapter publicId={work.publicId} slug={work.slug} chapter={chapter.number} pages={pages} title={work.title} label="Download this chapter (CBZ)" />
            </Group>
            <button className="btn-ghost w-full !text-white/60" onClick={() => { set(DEFAULT_READER); try { localStorage.removeItem(HINT_KEY); } catch { /* ignore */ } }}>
              <RotateCcw className="h-4 w-4" /> Reset to defaults
            </button>
            <p className="hidden text-xs leading-relaxed text-white/45 sm:block">
              Keys: arrows turn pages, <kbd>Space</kbd> next, <kbd>Z</kbd> zoom, <kbd>P</kbd> auto-play, <kbd>M</kbd> mode, <kbd>F</kbd> fullscreen, <kbd>[</kbd> <kbd>]</kbd> chapters, <kbd>S</kbd> settings. The mouse wheel turns pages too.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Tip({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <span className="flex items-start gap-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-accent">{icon}</span>
      <span className="block">
        <span className="block font-semibold">{title}</span>
        <span className="block text-white/60">{body}</span>
      </span>
    </span>
  );
}

function EndCard({ work, chapter, next, prev, onNext }: { work: Props["work"]; chapter: number; next: number | null; prev: number | null; onNext: () => void }) {
  return (
    <div className="mx-auto my-16 max-w-sm px-6 text-center">
      <div className="space-y-5 rounded-3xl bg-neutral-900/90 px-6 py-10 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
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
    </div>
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
