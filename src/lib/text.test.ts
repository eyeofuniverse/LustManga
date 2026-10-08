import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDescription } from "./text";

test("credits after a horizontal rule are dropped (the real MangaDex shape)", () => {
  const raw = "Takemura wakes up after falling ill.\n\nWhat will he do now?\n\n---\n**Character Designer:** [Saburou](https://mangadex.org/author/abc-123)";
  assert.equal(cleanDescription(raw), "Takemura wakes up after falling ill.\n\nWhat will he do now?");
});

test("links become their text, formatting marks disappear", () => {
  assert.equal(cleanDescription("A **bold** move, an *italic* one, and a [link](http://x.example/y) too."), "A bold move, an italic one, and a link too.");
});

test("bare URLs and images are removed", () => {
  assert.equal(cleanDescription("Read it at https://example.com/page now ![cover](https://x/y.png)"), "Read it at  now");
});

test("headings, quotes and code marks are stripped", () => {
  assert.equal(cleanDescription("# Title\n> quoted line\n`code`"), "Title\nquoted line\ncode");
});

test("empty, null and markup-only input give null", () => {
  assert.equal(cleanDescription(null), null);
  assert.equal(cleanDescription(""), null);
  assert.equal(cleanDescription("---\nonly credits"), null);
});

test("underscores inside words are left alone", () => {
  assert.equal(cleanDescription("snake_case_word stays"), "snake_case_word stays");
});

test("very long text is capped", () => {
  assert.equal(cleanDescription("x".repeat(5000))!.length, 1200);
});
