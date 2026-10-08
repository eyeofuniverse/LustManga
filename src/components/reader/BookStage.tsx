"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { fitPage, type Slide } from "@/lib/spreads";
import type { ReaderPage } from "./types";

/**
 * The book: pages sit side by side on a track that follows the finger, then settles on the page you chose.
 * Touch, mouse drag, trackpad/wheel, keyboard (via the handle) and tap zones all end up in go(). Pinch,
 * double-tap and ctrl+wheel zoom the page; while zoomed a drag pans instead of turning.
 *
 * Gestures move the DOM directly (no React state per pointer move), so a swipe stays at 60fps even with big images.
 */
export interface BookHandle {
  go(dir: 1 | -1, crossChapters?: boolean): void;
  toggleZoom(): void;
}
interface Props {
  ref?: React.Ref<BookHandle>;
  slides: Slide[];
  pages: ReaderPage[];
  index: number;
  rtl: boolean;
  /** 0..1 brightness */
  brightness: number;
  endCard: React.ReactNode;
  onIndex(index: number): void;
  /** the reader tried to go past the first (-1) or last (1) slide */
  onEdge(dir: 1 | -1): void;
  onToggleUi(): void;
  onZoomChange?(zoomed: boolean): void;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 300;
const TURN_MS = 340;

type Gesture = {
  pts: Map<number, { x: number; y: number }>;
  mode: "idle" | "swipe" | "pan" | "pinch" | "ignore";
  sx: number;
  sy: number;
  st: number;
  ox: number;
  oy: number;
  samples: { x: number; t: number }[];
  dx: number;
  d0: number;
  s0: number;
};

export function BookStage({ ref, slides, pages, index, rtl, brightness, endCard, onIndex, onEdge, onToggleUi, onZoomChange }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const zoomEl = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  const z = useRef({ s: 1, x: 0, y: 0 });
  const zoomedRef = useRef(false);
  const g = useRef<Gesture>({ pts: new Map(), mode: "idle", sx: 0, sy: 0, st: 0, ox: 0, oy: 0, samples: [], dx: 0, d0: 1, s0: 1 });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastWheel = useRef(0);
  // momentum scrolling and a double-click on the button that opened the book must not turn its first pages
  const born = useRef(Date.now());
  const count = slides.length;
  const vIndex = (i: number) => (rtl ? count - 1 - i : i);
  const reduce = useRef(false);

  // keep the latest props reachable from the (stable) native listeners
  const live = useRef({ index, count, rtl, onIndex, onEdge, onToggleUi, onZoomChange });
  live.current = { index, count, rtl, onIndex, onEdge, onToggleUi, onZoomChange };

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  /* ───────── size ───────── */
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      sizeRef.current = next;
      setSize((s) => (s.w === next.w && s.h === next.h ? s : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ───────── track position ───────── */
  const place = useCallback((dx: number, ms: number) => {
    const el = track.current;
    if (!el) return;
    const { index: i, count: n, rtl: r } = live.current;
    const v = r ? n - 1 - i : i;
    el.style.transition = ms && !reduce.current ? `transform ${ms}ms cubic-bezier(.2,.85,.25,1)` : "none";
    el.style.transform = `translate3d(calc(${-v * 100}% + ${dx}px),0,0)`;
  }, []);

  const prevIndex = useRef(index);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const adjacent = Math.abs(index - prevIndex.current) === 1;
    prevIndex.current = index;
    place(0, mounted.current && adjacent ? TURN_MS : 0);
    mounted.current = true;
    resetZoom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, rtl, count]);

  /* ───────── zoom ───────── */
  const applyZoom = (ms = 0) => {
    const el = zoomEl.current;
    if (!el) return;
    const { s, x, y } = z.current;
    el.style.transition = ms && !reduce.current ? `transform ${ms}ms cubic-bezier(.2,.85,.25,1)` : "none";
    el.style.transform = s === 1 && x === 0 && y === 0 ? "" : `translate3d(${x}px,${y}px,0) scale(${s})`;
    const zoomed = s > 1.02;
    if (zoomed !== zoomedRef.current) {
      zoomedRef.current = zoomed;
      live.current.onZoomChange?.(zoomed);
    }
  };
  const clampZoom = () => {
    const { w, h } = sizeRef.current;
    const mx = ((z.current.s - 1) * w) / 2;
    const my = ((z.current.s - 1) * h) / 2;
    z.current.x = clamp(z.current.x, -mx, mx);
    z.current.y = clamp(z.current.y, -my, my);
  };
  function resetZoom(animate: boolean) {
    z.current = { s: 1, x: 0, y: 0 };
    applyZoom(animate ? 220 : 0);
  }
  /** zoom to scale s keeping the screen point (px,py) where it is */
  const zoomAt = (px: number, py: number, s: number, ms = 0) => {
    const { w, h } = sizeRef.current;
    const next = clamp(s, 1, MAX_ZOOM);
    const k = next / z.current.s;
    const cx = px - w / 2;
    const cy = py - h / 2;
    z.current.x = cx - k * (cx - z.current.x);
    z.current.y = cy - k * (cy - z.current.y);
    z.current.s = next;
    if (next <= 1.001) z.current = { s: 1, x: 0, y: 0 };
    clampZoom();
    applyZoom(ms);
  };
  const toggleZoomAt = (px: number, py: number) => (z.current.s > 1.02 ? resetZoom(true) : zoomAt(px, py, 2.4, 240));

  /* ───────── turning ───────── */
  const go = useCallback(
    (dir: 1 | -1, crossChapters = true) => {
      clearTimeout(tapTimer.current); // a pending "tap in the middle" must not toggle the bars after this page turn
      const { index: i, count: n } = live.current;
      const to = i + dir;
      if (to < 0 || to >= n) {
        // nothing further: a small nudge, then let the reader decide (previous / next chapter)
        place(dir * (live.current.rtl ? 1 : -1) * 28, 120);
        setTimeout(() => place(0, 260), 120);
        if (crossChapters) live.current.onEdge(dir);
        return;
      }
      if (typeof navigator.vibrate === "function") navigator.vibrate(6);
      live.current.onIndex(to);
    },
    [place],
  );

  useImperativeHandle(ref, () => ({
    go,
    toggleZoom: () => {
      const { w, h } = sizeRef.current;
      toggleZoomAt(w / 2, h / 2);
    },
  }));

  /* ───────── pointer gestures ───────── */
  const dirOf = (dx: number): 1 | -1 => {
    // dragging the page to the left moves forward in left-to-right books, backward in right-to-left ones
    const forward = live.current.rtl ? dx > 0 : dx < 0;
    return forward ? 1 : -1;
  };

  const clearTap = () => {
    clearTimeout(tapTimer.current);
    tapTimer.current = undefined;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input,select,[data-nodrag]")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const st = g.current;
    st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pts.size === 2) {
      const [a, b] = [...st.pts.values()];
      st.mode = "pinch";
      st.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      st.s0 = z.current.s;
      clearTap();
      lastTap.current = null;
      place(0, 160); // abandon a half-made swipe
      return;
    }
    st.mode = "idle";
    st.sx = e.clientX;
    st.sy = e.clientY;
    st.st = Date.now();
    st.ox = z.current.x;
    st.oy = z.current.y;
    st.dx = 0;
    st.samples = [{ x: e.clientX, t: st.st }];
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = g.current;
    if (!st.pts.has(e.pointerId)) {
      // hovering with a mouse: show which edge would turn the page
      if (e.pointerType === "mouse" && stage.current) {
        const x = e.clientX / (sizeRef.current.w || 1);
        stage.current.style.cursor = z.current.s > 1.02 ? "grab" : x < 0.3 || x > 0.7 ? "pointer" : "default";
      }
      return;
    }
    st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (st.mode === "pinch") {
      if (st.pts.size < 2) return;
      const [a, b] = [...st.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, st.s0 * (d / st.d0));
      return;
    }
    if (st.pts.size !== 1) return;

    const dx = e.clientX - st.sx;
    const dy = e.clientY - st.sy;
    if (st.mode === "idle" && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      clearTap();
      if (z.current.s > 1.02) st.mode = "pan";
      else if (Math.abs(dx) > Math.abs(dy) * 1.2) st.mode = "swipe";
      else st.mode = "ignore";
      if (st.mode === "swipe" || st.mode === "pan") {
        stage.current?.setPointerCapture(e.pointerId);
        if (track.current) track.current.style.transition = "none";
      }
    }
    if (st.mode === "swipe") {
      const { index: i, count: n } = live.current;
      const to = i + dirOf(dx);
      const shown = to < 0 || to >= n ? dx * 0.3 : dx; // resistance at the very first / last slide
      st.dx = dx;
      const now = Date.now();
      st.samples.push({ x: e.clientX, t: now });
      while (st.samples.length > 2 && now - st.samples[0].t > 100) st.samples.shift();
      place(shown, 0);
    } else if (st.mode === "pan") {
      z.current.x = st.ox + dx;
      z.current.y = st.oy + dy;
      clampZoom();
      applyZoom(0);
    }
  };

  const release = (e: React.PointerEvent, cancelled: boolean) => {
    const st = g.current;
    if (!st.pts.delete(e.pointerId)) return;
    if (st.mode === "pinch") {
      if (st.pts.size === 0) {
        st.mode = "idle";
        if (z.current.s < 1.08) resetZoom(true);
      } else {
        st.mode = "ignore";
      }
      return;
    }
    const mode = st.mode;
    st.mode = "idle";
    if (mode === "swipe") {
      const W = sizeRef.current.w || 1;
      const first = st.samples[0];
      const dt = Math.max(1, Date.now() - first.t);
      const v = (e.clientX - first.x) / dt; // px/ms
      const dx = st.dx;
      const far = Math.abs(dx) > Math.min(140, W * 0.2);
      const flick = Math.abs(v) > 0.45 && Math.abs(dx) > 24;
      if (!cancelled && (far || flick)) go(dirOf(dx));
      else place(0, 260);
      return;
    }
    if (mode === "idle" && !cancelled && Date.now() - st.st < 500) tap(e.clientX, e.clientY);
  };

  const tap = (x: number, y: number) => {
    const now = Date.now();
    if (now - born.current < 450) return;
    const prev = lastTap.current;
    if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(x - prev.x, y - prev.y) < 40) {
      clearTap();
      lastTap.current = null;
      toggleZoomAt(x, y);
      return;
    }
    lastTap.current = { t: now, x, y };
    const frac = x / (sizeRef.current.w || 1);
    if (z.current.s <= 1.02 && (frac < 0.3 || frac > 0.7)) {
      // the edges turn the page straight away; only the middle waits to see whether a double-tap follows
      lastTap.current = null;
      // left edge: back in a left-to-right book, forward in a right-to-left one
      const leftEdge = frac < 0.3;
      go(leftEdge === live.current.rtl ? 1 : -1);
      return;
    }
    clearTap();
    tapTimer.current = setTimeout(() => live.current.onToggleUi(), DOUBLE_TAP_MS - 50);
  };

  /* ───────── wheel / trackpad ───────── */
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        zoomAt(e.clientX, e.clientY, z.current.s * Math.exp(-e.deltaY * 0.01));
        return;
      }
      if (z.current.s > 1.02) {
        z.current.x -= e.deltaX;
        z.current.y -= e.deltaY;
        clampZoom();
        applyZoom(0);
        return;
      }
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const delta = horizontal ? e.deltaX : e.deltaY;
      const now = Date.now();
      if (Math.abs(delta) < 12 || now - lastWheel.current < 480 || now - born.current < 800) return; // one turn per flick, not one per inertia event
      lastWheel.current = now;
      // a wheel flick turns pages but never jumps chapters: its momentum would carry a reader straight past the end card
      go(horizontal && live.current.rtl ? (delta > 0 ? -1 : 1) : delta > 0 ? 1 : -1, false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  useEffect(() => () => clearTap(), []);

  // load the pages around the current one before they are needed
  useEffect(() => {
    for (let d = -2; d <= 4; d++) {
      const s = slides[index + d];
      if (s?.kind === "pages") for (const n of s.pages) if (pages[n - 1]) new Image().src = pages[n - 1].src;
    }
  }, [index, slides, pages]);

  /* ───────── render ───────── */
  const ready = size.w > 0 && size.h > 0;
  return (
    <div
      ref={stage}
      className="fixed inset-0 touch-none select-none overflow-hidden overscroll-none"
      style={{ background: "radial-gradient(120% 90% at 50% 40%, #1b1b24 0%, #0a0a0e 70%, #050507 100%)", filter: `brightness(${brightness})` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => release(e, false)}
      onPointerCancel={(e) => release(e, true)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Pages"
    >
      <div ref={zoomEl} className="absolute inset-0 will-change-transform">
        <div ref={track} className="absolute inset-0 will-change-transform">
          {ready &&
            slides.map((s, i) => {
              if (Math.abs(i - index) > 2) return null;
              const active = i === index;
              const shown = s.kind === "pages" ? (rtl ? [...s.pages].reverse() : s.pages) : [];
              const two = shown.length === 2;
              const box = { w: two ? size.w / 2 : size.w, h: size.h };
              return (
                <div
                  key={s.kind === "end" ? "end" : s.pages.join("-")}
                  className="absolute top-0 h-full w-full"
                  style={{ left: `${vIndex(i) * 100}%` }}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={s.kind === "end" ? "End of chapter" : `Page ${s.pages.join(" and ")}`}
                  aria-hidden={!active}
                  inert={!active}
                >
                  {/* the shadow the previous page casts as it slides over this one */}
                  <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 z-10 w-10 ${rtl ? "right-0 -scale-x-100" : "left-0"}`} style={{ background: "linear-gradient(90deg, rgba(0,0,0,.5), transparent)" }} />
                  {s.kind === "end" ? (
                    <div className="grid h-full w-full place-items-center overflow-y-auto">{endCard}</div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      {shown.map((n, k) => {
                        const p = pages[n - 1];
                        const dims = fitPage({ w: p?.w ?? 0, h: p?.h ?? 0 }, box);
                        return (
                          <div key={n} className={two ? `flex w-1/2 ${k === 0 ? "justify-end" : "justify-start"}` : "flex"}>
                            <PageImg page={p} n={n} w={dims.w} h={dims.h} eager={Math.abs(i - index) <= 1} edge={two ? (k === 0 ? "right" : "left") : null} />
                          </div>
                        );
                      })}
                      {two && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-[9%] max-w-28 -translate-x-1/2"
                          style={{ background: "linear-gradient(90deg, transparent, rgba(0,0,0,.25) 40%, rgba(0,0,0,.55) 50%, rgba(0,0,0,.25) 60%, transparent)" }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function PageImg({ page, n, w, h, eager, edge }: { page: ReaderPage | undefined; n: number; w: number; h: number; eager: boolean; edge: "left" | "right" | null }) {
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  const [tries, setTries] = useState(0);
  if (!page) return null;
  return (
    <div
      className="relative shrink-0 overflow-hidden bg-neutral-900 ring-1 ring-white/10"
      style={{
        width: w,
        height: h,
        // pages stand off the desk; in a spread the two pages share the spine so only the outer edges throw a shadow
        boxShadow: edge === "right" ? "-18px 8px 50px rgba(0,0,0,.65)" : edge === "left" ? "18px 8px 50px rgba(0,0,0,.65)" : "0 14px 60px rgba(0,0,0,.7)",
        borderRadius: edge === "right" ? "6px 0 0 6px" : edge === "left" ? "0 6px 6px 0" : 6,
      }}
    >
      {state === "loading" && <div className="skeleton absolute inset-0" aria-hidden="true" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={tries}
        src={tries ? `${page.src}?r=${tries}` : page.src}
        alt={`Page ${n}`}
        width={page.w || undefined}
        height={page.h || undefined}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none"
        onLoad={() => setState("ok")}
        onError={() => setState("fail")}
      />
      {state === "fail" && (
        <button type="button" onClick={() => { setState("loading"); setTries((t) => t + 1); }} className="absolute inset-0 z-10 grid place-items-center bg-black/60 text-sm font-semibold text-white/80" aria-label={`Reload page ${n}`}>
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3">
            <RotateCw className="h-5 w-5" /> Page {n} failed to load. Tap to retry
          </span>
        </button>
      )}
    </div>
  );
}
