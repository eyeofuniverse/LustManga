import { test } from "node:test";
import assert from "node:assert/strict";
import { BIG_WORK_PAGES, EVERY_BIG, EVERY_SMALL, MAX_PER_CHAPTER, MIN_TAIL, readerAdEvery, readerAdPositions } from "./reader";

test("interval: 15 for a short work, 30 from 100 pages up (the whole work, not the chapter)", () => {
  assert.equal(readerAdEvery(1), EVERY_SMALL);
  assert.equal(readerAdEvery(40), 15);
  assert.equal(readerAdEvery(BIG_WORK_PAGES - 1), 15);
  assert.equal(readerAdEvery(BIG_WORK_PAGES), EVERY_BIG);
  assert.equal(readerAdEvery(557), 30);
});

test("positions: after every interval, never in the last pages, never before the first interval", () => {
  assert.deepEqual(readerAdPositions(40, 15), [15, 30]);
  assert.deepEqual(readerAdPositions(36, 15), [15, 30]);
  assert.deepEqual(readerAdPositions(35, 15), [15], "30 + 6 > 35: an ad after page 30 would sit right before the end");
  assert.deepEqual(readerAdPositions(15 + MIN_TAIL, 15), [15]);
  assert.deepEqual(readerAdPositions(15 + MIN_TAIL - 1, 15), [], "fewer than MIN_TAIL pages would follow");
  assert.deepEqual(readerAdPositions(14, 15), [], "a chapter shorter than one interval has none");
  assert.deepEqual(readerAdPositions(100, 30), [30, 60, 90]);
  assert.deepEqual(readerAdPositions(96, 30), [30, 60, 90]);
  assert.deepEqual(readerAdPositions(95, 30), [30, 60]);
});

test("positions: every one leaves room after it, they are spaced by the interval, and a huge chapter is capped", () => {
  for (const [total, every] of [[40, 15], [27, 15], [26, 15], [120, 30], [1718, 30], [500, 15]] as const) {
    const p = readerAdPositions(total, every);
    for (const x of p) assert.ok(x >= every && total - x >= MIN_TAIL, `${total}/${every}: ${x}`);
    p.slice(1).forEach((x, i) => assert.equal(x - p[i]!, every));
    assert.ok(p.length <= MAX_PER_CHAPTER);
  }
  assert.equal(readerAdPositions(1718, 30).length, MAX_PER_CHAPTER);
  assert.equal(readerAdPositions(500, 15).length, MAX_PER_CHAPTER);
});

test("positions: nonsense in, nothing out", () => {
  for (const [t, e] of [[NaN, 15], [40, NaN], [40, 0], [40, -5], [-3, 15], [0, 15], [Infinity, 15]] as const) assert.deepEqual(readerAdPositions(t, e), [], `${t}/${e}`);
});
