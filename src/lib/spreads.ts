/**
 * Book layout: how a chapter's pages are grouped into the "slides" a reader swipes through.
 * Single-page mode is one page per slide. Spread mode behaves like a printed book: the first page
 * (the cover) stands alone, the rest are paired left/right, and a page that is already a double-page
 * illustration (wider than tall) always gets a slide to itself. The last slide is the end-of-chapter card.
 */
export interface Dim {
  w: number;
  h: number;
}
export type Slide = { kind: "pages"; pages: number[] } | { kind: "end" };

export const isWide = (d: Dim) => d.w > 0 && d.h > 0 && d.w > d.h * 1.15;

export function buildSlides(dims: Dim[], spread: boolean, coverAlone = true): Slide[] {
  const out: Slide[] = [];
  let i = 0;
  while (i < dims.length) {
    const pair = spread && (i > 0 || !coverAlone) && i + 1 < dims.length && !isWide(dims[i]) && !isWide(dims[i + 1]);
    if (pair) {
      out.push({ kind: "pages", pages: [i + 1, i + 2] });
      i += 2;
    } else {
      out.push({ kind: "pages", pages: [i + 1] });
      i += 1;
    }
  }
  out.push({ kind: "end" });
  return out;
}

/** index of the slide showing a 1-based page; a page past the last one means the end card */
export function slideOfPage(slides: Slide[], page: number): number {
  const i = slides.findIndex((s) => s.kind === "pages" && s.pages.includes(page));
  return i === -1 ? slides.length - 1 : i;
}

/** the page number a slide stands for: its lowest page, or total + 1 for the end card */
export function pageOfSlide(slides: Slide[], index: number, total: number): number {
  const s = slides[index];
  return s?.kind === "pages" ? s.pages[0] : total + 1;
}

/** Webtoon-style strips are tall slivers; they read better scrolling than paged. */
export function isLongStrip(dims: Dim[]): boolean {
  const ratios = dims.filter((d) => d.w > 0 && d.h > 0).map((d) => d.h / d.w).sort((a, b) => a - b);
  if (ratios.length < 3) return false;
  return ratios[Math.floor(ratios.length / 2)] >= 2.2;
}

/** Two pages side by side only make sense on a wide, landscape-ish screen. */
export function wantsSpread(width: number, height: number): boolean {
  return width >= 900 && height > 0 && width / height >= 1.15;
}

/** Largest size for a page of the given shape inside a box, never enlarged past 2.5x its own pixels. */
export function fitPage(page: Dim, box: Dim): Dim {
  const ratio = page.w > 0 && page.h > 0 ? page.w / page.h : 2 / 3;
  let w = box.w;
  let h = w / ratio;
  if (h > box.h) {
    h = box.h;
    w = h * ratio;
  }
  if (page.w > 0 && w > page.w * 2.5) {
    w = page.w * 2.5;
    h = w / ratio;
  }
  return { w: Math.floor(w), h: Math.floor(h) };
}
