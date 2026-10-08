import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmptyQuery, normText, parseQuery, tokenize } from "./search";

test("tokenize keeps quoted phrases together and drops the quotes", () => {
  assert.deepEqual(tokenize('big breasts "exact phrase" tag:"two words"'), ["big", "breasts", "exact phrase", "tag:two words"]);
  assert.deepEqual(tokenize("   spaced    out  "), ["spaced", "out"]);
  assert.deepEqual(tokenize(""), []);
});

test("plain words become title text; -word excludes", () => {
  const p = parseQuery("school life -ecchi");
  assert.deepEqual(p.text, ["school", "life"]);
  assert.deepEqual(p.excludeText, ["ecchi"]);
});

test("field terms, with quotes, negation and aliases", () => {
  const p = parseQuery('tag:"big breasts" -tag:netorare artist:foo lang:english cat:doujinshi circle:bar series:"some show" char:alice');
  assert.deepEqual(p.terms, [
    { neg: false, field: "tag", value: "big breasts" },
    { neg: true, field: "tag", value: "netorare" },
    { neg: false, field: "artist", value: "foo" },
    { neg: false, field: "language", value: "english" },
    { neg: false, field: "category", value: "doujinshi" },
    { neg: false, field: "group", value: "bar" },
    { neg: false, field: "parody", value: "some show" },
    { neg: false, field: "character", value: "alice" },
  ]);
});

test("page-count conditions", () => {
  assert.deepEqual(parseQuery("pages:>20 pages:<=40 pages:12").pages, [
    { op: ">", n: 20 },
    { op: "<=", n: 40 },
    { op: "=", n: 12 },
  ]);
});

test("uploaded conditions are ages in days", () => {
  assert.deepEqual(parseQuery("uploaded:<7d uploaded:>2w uploaded:<1m uploaded:>1y uploaded:<3").uploaded, [
    { op: "<", n: 7 },
    { op: ">", n: 14 },
    { op: "<", n: 30 },
    { op: ">", n: 365 },
    { op: "<", n: 3 },
  ]);
});

test("unknown fields are ordinary text; malformed numbers are ignored; empty values are skipped", () => {
  const p = parseQuery("foo:bar pages:abc tag: tag:ok");
  assert.deepEqual(p.text, ["foo:bar"]);
  assert.deepEqual(p.pages, []);
  assert.deepEqual(p.terms, [{ neg: false, field: "tag", value: "ok" }]);
});

test("a lone dash is text, not an exclusion", () => {
  assert.deepEqual(parseQuery("-").text, ["-"]);
});

test("isEmptyQuery", () => {
  assert.equal(isEmptyQuery(parseQuery("   ")), true);
  assert.equal(isEmptyQuery(parseQuery("a")), false);
  assert.equal(isEmptyQuery(parseQuery("pages:>1")), false);
});

test("normText folds case, accents and punctuation like Work.titleNorm", () => {
  assert.equal(normText("Café  Story!"), "cafe story");
  assert.equal(normText("私の物語"), "私の物語");
});
