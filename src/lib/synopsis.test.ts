import { test } from "node:test";
import assert from "node:assert/strict";
import { synopsis, type SynopsisInput } from "./synopsis";

const base = (over: Partial<SynopsisInput> = {}): SynopsisInput => ({
  publicId: 100,
  title: "Gotoubun no Hanayome Special",
  language: "en",
  category: "DOUJINSHI",
  pageCount: 24,
  artists: ["bad mushrooms"],
  circles: ["bad mushrooms"],
  parodies: ["go-toubun no hanayome"],
  characters: ["miku nakano", "itsuki nakano"],
  tags: ["big breasts", "full color", "netorare", "glasses"],
  translations: ["es", "ko"],
  ...over,
});

test("it states only facts we hold: artist, length, parody, cast, themes, translations", () => {
  const s = synopsis(base());
  assert.ok(s.includes("Gotoubun no Hanayome Special"), s);
  assert.ok(s.includes("24"), s);
  assert.ok(/Bad Mushrooms/.test(s), s);
  assert.ok(s.includes("Go-Toubun No Hanayome"), s);
  assert.ok(s.includes("Miku Nakano and Itsuki Nakano"), s);
  assert.ok(s.includes("Big Breasts") && s.includes("Netorare"), s);
  assert.ok(!/full color/i.test(s), "file-level tags are not themes");
  assert.ok(s.includes("Also available in Spanish and Korean."), s);
  assert.ok(!/undefined|null|NaN/.test(s), s);
});

test("a work with few facts still reads as complete sentences", () => {
  const s = synopsis(base({ artists: [], circles: [], parodies: [], characters: [], tags: [], translations: [] }));
  assert.ok(s.length > 20 && /\.$/.test(s), s);
  assert.ok(!/undefined|null/.test(s), s);
});

test("an original work says so instead of naming a parody", () => {
  const s = synopsis(base({ parodies: ["original"], characters: [] }));
  assert.ok(s.includes("original work"), s);
});

test("wording rotates with the work number, so neighbours do not read as copies", () => {
  const openings = new Set([100, 101, 102, 103].map((n) => synopsis(base({ publicId: n })).split(".")[0].replace(/Gotoubun[^,:]*/, "T")));
  assert.ok(openings.size >= 3, [...openings].join(" | "));
  assert.equal(synopsis(base()), synopsis(base()), "same input, same text");
});

test("it stays short", () => {
  assert.ok(synopsis(base({ tags: Array.from({ length: 30 }, (_, i) => `theme ${i}`), characters: ["a", "b", "c", "d", "e"] })).length < 520);
});

test("event and file tags are not themes, and every text starts with a capital", () => {
  const s = synopsis(base({ publicId: 105, tags: ["C96", "scanmark", "rough translation", "glasses"], artists: ["starscream"], circles: [] }));
  assert.ok(!/C96|scanmark|rough translation/i.test(s), s);
  assert.ok(s.includes("Glasses"), s);
  for (const n of [100, 101, 102, 103, 104, 105]) assert.match(synopsis(base({ publicId: n })), /^[A-Z0-9]/);
});
