import { test } from "node:test";
import assert from "node:assert/strict";
import { browseLead, joinList, libraryParagraph, longDate, plural, readingMinutes, readingTime, type LibraryFacts } from "./blurbs";

const NOW = new Date("2026-10-12T12:00:00Z");
const facts: LibraryFacts = { works: 19876, chapters: 31000, pages: 2400000, languages: 16, artists: 2488, circles: 893, parodies: 483, tags: 933, latest: "2026-10-12T08:00:00Z" };

test("library paragraph: states the numbers it was given, and only mentions a recent upload when there is one", () => {
  const p = libraryParagraph(facts, NOW);
  assert.match(p, /19,876 hentai manga/);
  assert.match(p, /31,000 chapters and 2,400,000 pages/);
  assert.match(p, /in 16 languages/);
  assert.match(p, /2,488 artists and 893 circles/);
  assert.match(p, /free online|read online for free/);
  assert.match(p, /newest work was added 4 hours ago/);
  // a quiet library does not claim freshness; a missing date is fine
  assert.doesNotMatch(libraryParagraph({ ...facts, latest: "2026-08-01T00:00:00Z" }, NOW), /newest work/);
  assert.doesNotMatch(libraryParagraph({ ...facts, latest: null }, NOW), /newest work/);
  // an empty library says nothing it cannot back up
  assert.equal(libraryParagraph({ ...facts, works: 0 }, NOW), "LustPages is a free library of hentai manga and doujinshi.");
  // a library in one language does not say "in 1 languages"
  assert.doesNotMatch(libraryParagraph({ ...facts, languages: 1 }, NOW), /languages/);
});

test("reading time: about 20 seconds a page, never zero, hours when long", () => {
  assert.equal(readingMinutes(1), 1);
  assert.equal(readingMinutes(557), 186);
  assert.equal(readingTime(3), "about 1 minute");
  assert.equal(readingTime(27), "about 9 minutes");
  assert.equal(readingTime(180), "about 1 hour");
  assert.equal(readingTime(557), "about 3 hours", "a few spare minutes are not worth saying");
  assert.equal(readingTime(250), "about 1 hour 23 minutes");
});

test("small formatters", () => {
  assert.equal(plural(1, "chapter"), "1 chapter");
  assert.equal(plural(21, "chapter"), "21 chapters");
  assert.equal(plural(1200, "page"), "1,200 pages");
  assert.equal(joinList(["a"]), "a");
  assert.equal(joinList(["a", "b"]), "a and b");
  assert.equal(joinList(["a", "b", "c"]), "a, b and c");
  assert.equal(joinList([]), "");
  assert.equal(longDate("2026-10-08T23:30:00Z"), "October 8, 2026");
});

test("browse lead: names the order, the filters and the size", () => {
  const base = { total: 10000, sortLabel: "Popular", languages: [], categories: [] };
  assert.equal(browseLead(base), "10,000 works of hentai manga, doujinshi and more in every language, ordered by popular.");
  assert.equal(browseLead({ ...base, total: 42, sortLabel: "Newest", languages: ["English", "Spanish"], categories: ["Manga"] }), "42 works of manga in English and Spanish, ordered by newest.");
  assert.match(browseLead({ ...base, total: 0 }), /^No works of/);
});
