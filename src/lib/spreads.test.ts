import { test } from "node:test";
import assert from "node:assert/strict";
import { adSlideIndex, buildSlides, fitPage, isLongStrip, pageOfSlide, slideOfPage, wantsSpread } from "./spreads";

const portrait = { w: 800, h: 1200 };
const wide = { w: 2400, h: 1200 };
const pagesOf = (s: ReturnType<typeof buildSlides>) => s.map((x) => (x.kind === "end" ? "end" : x.kind === "ad" ? `ad@${x.after}` : x.pages.join("+")));

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

test("an ad slide sits after the page it follows, between pages slides, and never changes what a page is", () => {
  const dims = Array(40).fill(portrait);
  const slides = buildSlides(dims, false, true, [15, 30]);
  assert.equal(slides.length, 40 + 2 + 1);
  assert.deepEqual(pagesOf(slides).slice(13, 18), ["14", "15", "ad@15", "16", "17"]);
  assert.equal(slides[0]!.kind, "pages", "never first");
  assert.equal(slides[slides.length - 1]!.kind, "end", "the end card is still last");
  assert.equal(slides[slides.length - 2]!.kind, "pages", "and an ad is never right before it");
  assert.equal(adSlideIndex(slides, 15), 15);
  assert.equal(adSlideIndex(slides, 30), 31);
  assert.equal(adSlideIndex(slides, 99), -1);
  // pages keep their numbers and their slides
  assert.equal(slideOfPage(slides, 15), 14);
  assert.equal(slideOfPage(slides, 16), 16);
  assert.equal(slideOfPage(slides, 41), slides.length - 1);
  // an ad stands for the page before it, so progress and the page line stay where the reader is
  assert.equal(pageOfSlide(slides, 15, 40), 15);
  assert.equal(pageOfSlide(slides, 16, 40), 16);
  assert.equal(pageOfSlide(slides, slides.length - 1, 40), 41);
});

test("ads in spread mode follow the slide that holds their page", () => {
  const slides = buildSlides(Array(40).fill(portrait), true, true, [15, 30]); // 1 | 2+3 | ... | 14+15 | ad | 16+17 ...
  const at = pagesOf(slides);
  assert.equal(at.indexOf("14+15") + 1, at.indexOf("ad@15"));
  assert.equal(at.filter((x) => x.startsWith("ad@")).length, 2);
  // a position inside a pair is placed after the pair
  const odd = pagesOf(buildSlides(Array(40).fill(portrait), true, true, [16]));
  assert.equal(odd[odd.indexOf("ad@16") - 1], "16+17");
});

test("ad positions are tidied: unsorted, duplicated, past the end or nonsense are handled, and none follows the last pages", () => {
  const dims = Array(10).fill(portrait);
  assert.deepEqual(pagesOf(buildSlides(dims, false, true, [])).filter((x) => x.startsWith("ad")), []);
  assert.deepEqual(pagesOf(buildSlides(dims, false, true, [5, 3, 3])).filter((x) => x.startsWith("ad")), ["ad@3", "ad@5"]);
  assert.deepEqual(pagesOf(buildSlides(dims, false, true, [10, 99, 0, -1, NaN, 1.5])).filter((x) => x.startsWith("ad")), [], "after the final page, past the end and nonsense: no slide");
  assert.equal(pagesOf(buildSlides(dims, false, true, [9])).filter((x) => x.startsWith("ad")).length, 1, "a position with a page still to come is kept");
});
