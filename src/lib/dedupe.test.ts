import { test } from "node:test";
import assert from "node:assert/strict";
import { artistsCompatible, hamming, normTitle, pickSurvivor } from "./dedupe";

test("normTitle strips artist/event/language brackets and punctuation", () => {
  assert.equal(normTitle("(C95) [Some Circle (Artist)] My Great Book! [English] [Digital]"), "my great book");
  assert.equal(normTitle("My Great Book"), "my great book");
  assert.equal(normTitle("my  great-book"), "my great book");
});

test("the same release from two sources normalises to the same key", () => {
  assert.equal(normTitle("[Artist] Title Here (Parody) [English]"), normTitle("Title Here"));
});

test("accents and width variants fold together", () => {
  assert.equal(normTitle("Café Ｓｔｏｒｙ"), normTitle("Cafe Story"));
});

test("CJK titles survive (not reduced to empty)", () => {
  assert.equal(normTitle("[作者] 私の物語 (C99)"), "私の物語");
  assert.notEqual(normTitle("私の物語"), "");
});

test("a title that is only brackets falls back to the raw text", () => {
  assert.notEqual(normTitle("[Only Brackets]"), "");
});

test("different titles stay different", () => {
  assert.notEqual(normTitle("Title One"), normTitle("Title Two"));
});

test("artistsCompatible: overlap passes, disjoint vetoes, unknown does not veto", () => {
  assert.equal(artistsCompatible(["Foo Bar"], ["foo-bar", "Baz"]), true);
  assert.equal(artistsCompatible(["Foo"], ["Baz"]), false);
  assert.equal(artistsCompatible([], ["Baz"]), true);
  assert.equal(artistsCompatible(["Foo"], []), true);
});

test("hamming distance of dHashes", () => {
  assert.equal(hamming("ffffffffffffffff", "ffffffffffffffff"), 0);
  assert.equal(hamming("0000000000000000", "000000000000000f"), 4);
  assert.equal(hamming("00", "0000"), 64);
});

test("pickSurvivor prefers published, then more pages, then older", () => {
  const d = (s: string) => new Date(s);
  const pub = { publish: "PUBLISHED", pageCount: 10, createdAt: d("2026-02-01") };
  const draft = { publish: "DRAFT", pageCount: 50, createdAt: d("2026-01-01") };
  assert.equal(pickSurvivor(draft, pub)[0], pub);
  const big = { publish: "PUBLISHED", pageCount: 30, createdAt: d("2026-03-01") };
  assert.equal(pickSurvivor(pub, big)[0], big);
  const older = { publish: "PUBLISHED", pageCount: 30, createdAt: d("2026-01-01") };
  assert.equal(pickSurvivor(big, older)[0], older);
});
