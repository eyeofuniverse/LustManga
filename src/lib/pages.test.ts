import { test } from "node:test";
import assert from "node:assert/strict";
import { pageKey, pagesOf } from "./pages";

test("page keys are derived, not stored", () => {
  assert.equal(pageKey("m1", "c1", 3), "w/m1/c1/3.webp");
  assert.equal(pageKey("m1", "c1", 3, "avif"), "w/m1/c1/3.avif");
});

test("pagesOf expands compact tuples in reading order, honouring per-page extensions", () => {
  const pages = pagesOf({ id: "c1", pageData: [[800, 1200, 111], [900, 1300, 222, "avif"], [700, 1000, 333]] }, "m1");
  assert.deepEqual(
    pages.map((p) => [p.n, p.key, p.width, p.height, p.bytes]),
    [
      [1, "w/m1/c1/1.webp", 800, 1200, 111],
      [2, "w/m1/c1/2.avif", 900, 1300, 222],
      [3, "w/m1/c1/3.webp", 700, 1000, 333],
    ],
  );
});

test("missing or malformed page data yields no pages instead of throwing", () => {
  assert.deepEqual(pagesOf({ id: "c", pageData: null }, "m"), []);
  assert.deepEqual(pagesOf({ id: "c", pageData: "nope" }, "m"), []);
});
