import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSlides, fitPage, isLongStrip, pageOfSlide, slideOfPage, wantsSpread } from "./spreads";

const portrait = { w: 800, h: 1200 };
const wide = { w: 2400, h: 1200 };
const pagesOf = (s: ReturnType<typeof buildSlides>) => s.map((x) => (x.kind === "end" ? "end" : x.pages.join("+")));

test("single-page mode is one slide per page plus the end card", () => {
  assert.deepEqual(pagesOf(buildSlides(Array(3).fill(portrait), false)), ["1", "2", "3", "end"]);
});

test("spread mode keeps the cover alone and pairs the rest like a printed book", () => {
  assert.deepEqual(pagesOf(buildSlides(Array(6).fill(portrait), true)), ["1", "2+3", "4+5", "6", "end"]);
  assert.deepEqual(pagesOf(buildSlides(Array(5).fill(portrait), true)), ["1", "2+3", "4+5", "end"]);
});

test("a double-page illustration always stands alone and pairing resumes after it", () => {
  const dims = [portrait, portrait, wide, portrait, portrait, portrait];
  assert.deepEqual(pagesOf(buildSlides(dims, true)), ["1", "2", "3", "4+5", "6", "end"]);
});

test("an empty chapter still has an end card", () => {
  assert.deepEqual(pagesOf(buildSlides([], true)), ["end"]);
});

test("page <-> slide mapping", () => {
  const slides = buildSlides(Array(6).fill(portrait), true); // 1 | 2+3 | 4+5 | 6 | end
  assert.equal(slideOfPage(slides, 1), 0);
  assert.equal(slideOfPage(slides, 3), 1);
  assert.equal(slideOfPage(slides, 6), 3);
  assert.equal(slideOfPage(slides, 7), 4); // total + 1 is the end card
  assert.equal(slideOfPage(slides, 999), 4);
  assert.equal(pageOfSlide(slides, 2, 6), 4);
  assert.equal(pageOfSlide(slides, 4, 6), 7);
});

test("long strips are detected by the median page shape", () => {
  assert.equal(isLongStrip(Array(8).fill({ w: 800, h: 4000 })), true);
  assert.equal(isLongStrip(Array(8).fill(portrait)), false);
  assert.equal(isLongStrip([{ w: 800, h: 4000 }, portrait, portrait, portrait]), false);
  assert.equal(isLongStrip([{ w: 800, h: 4000 }]), false); // too few pages to tell
  assert.equal(isLongStrip([{ w: 0, h: 0 }, { w: 0, h: 0 }, { w: 0, h: 0 }]), false);
});

test("spreads are for wide screens only", () => {
  assert.equal(wantsSpread(1440, 900), true);
  assert.equal(wantsSpread(1024, 768), true);
  assert.equal(wantsSpread(768, 1024), false); // tablet portrait
  assert.equal(wantsSpread(844, 390), false); // phone landscape is too small for two pages
  assert.equal(wantsSpread(1000, 0), false);
});

test("fitPage letterboxes inside the box and caps enlargement", () => {
  assert.deepEqual(fitPage({ w: 800, h: 1200 }, { w: 400, h: 400 }), { w: 266, h: 400 });
  assert.deepEqual(fitPage({ w: 800, h: 1200 }, { w: 300, h: 900 }), { w: 300, h: 450 });
  const tiny = fitPage({ w: 100, h: 150 }, { w: 2000, h: 2000 });
  assert.equal(tiny.w, 250);
  assert.deepEqual(fitPage({ w: 0, h: 0 }, { w: 400, h: 900 }), { w: 400, h: 600 }); // unknown shape falls back to 2:3
});

test("spreads can pair from the first page when the cover is not on its own", () => {
  assert.deepEqual(pagesOf(buildSlides(Array(6).fill(portrait), true, false)), ["1+2", "3+4", "5+6", "end"]);
  assert.deepEqual(pagesOf(buildSlides(Array(5).fill(portrait), true, false)), ["1+2", "3+4", "5", "end"]);
  assert.deepEqual(pagesOf(buildSlides(Array(4).fill(portrait), false, false)), ["1", "2", "3", "4", "end"]); // single-page mode ignores it
});
