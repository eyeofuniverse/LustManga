import { test } from "node:test";
import assert from "node:assert/strict";
import { flatParams, idParam, intParam, MAX_INT, stripNul, withQuery, workNumber } from "./url";
import { parsePrefs, MAX_HIDDEN } from "./prefs";
import { isEmptyQuery, parseQuery } from "./search";

test("ids from user input are positive integers that fit the database column", () => {
  assert.equal(idParam("74"), 74);
  assert.equal(idParam("74-some-slug"), 74);
  assert.equal(idParam(String(MAX_INT)), MAX_INT);
  assert.equal(idParam(String(MAX_INT + 1)), null); // would be a Postgres "out of range" error
  assert.equal(idParam("99999999999"), null);
  assert.equal(idParam("0"), null);
  assert.equal(idParam("-5"), null);
  assert.equal(idParam("abc"), null);
  assert.equal(idParam(undefined), null);
  assert.equal(idParam(12.5), null);
});

test("NUL bytes never reach the database", () => {
  assert.equal(stripNul("a\u0000b"), "ab");
  assert.deepEqual(flatParams({ q: "tag:\u0000", page: ["2", "3"], none: undefined }), { q: "tag:", page: "2", none: undefined });
});

test("intParam clamps", () => {
  assert.equal(intParam("abc"), 1);
  assert.equal(intParam("0", 1, 1, 500), 1);
  assert.equal(intParam("99999999", 1, 1, 500), 500);
  assert.equal(intParam("7", 1, 1, 500), 7);
});

test("withQuery drops empty values and applies the patch", () => {
  assert.equal(withQuery("/browse", { sort: "new", page: "3" }, { page: undefined }), "/browse?sort=new");
  assert.equal(withQuery("/browse", {}, { lang: "en,ja" }), "/browse?lang=en%2Cja");
});

test("a work number comes from a number or a pasted link, never from unrelated digits", () => {
  assert.equal(workNumber("1234"), "1234");
  assert.equal(workNumber(" #1234 "), "1234");
  assert.equal(workNumber("https://lustmanga.example/g/1234-some-title-2"), "1234");
  assert.equal(workNumber("https://lustmanga.example/read/77/3?p=9"), "77");
  assert.equal(workNumber("my title 2"), undefined);
  assert.equal(workNumber("12ab34"), undefined);
  assert.equal(workNumber(""), undefined);
});

test("search numbers are clamped so a huge value cannot overflow the database", () => {
  assert.deepEqual(parseQuery("pages:>99999999999").pages, [{ op: ">", n: 100_000 }]);
  assert.deepEqual(parseQuery("uploaded:<99999999999y").uploaded, [{ op: "<", n: 36_500 }]);
  assert.deepEqual(parseQuery("uploaded:<2w").uploaded, [{ op: "<", n: 14 }]);
});

test("a query of only punctuation is empty; a real word is not", () => {
  assert.equal(isEmptyQuery(parseQuery("!!!")), true);
  assert.equal(isEmptyQuery(parseQuery("- ?? ...")), true);
  assert.equal(isEmptyQuery(parseQuery("")), true);
  assert.equal(isEmptyQuery(parseQuery("school")), false);
  assert.equal(isEmptyQuery(parseQuery("-school")), false);
  assert.equal(isEmptyQuery(parseQuery('tag:"big breasts"')), false);
  assert.equal(isEmptyQuery(parseQuery("pages:>20")), false);
});

test("a hand-edited cookie cannot smuggle in a bad tag id or an oversized list", () => {
  const hide = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, name: "t" + i }));
  const raw = encodeURIComponent(JSON.stringify({ langs: ["en", "../x", "ja"], hide: [{ id: 99999999999, name: "huge" }, { id: -3, name: "neg" }, { id: 1.5, name: "frac" }, ...hide] }));
  const p = parsePrefs(raw);
  assert.deepEqual(p.langs, ["en", "ja"]);
  assert.equal(p.hide.length, MAX_HIDDEN);
  assert.ok(p.hide.every((h) => Number.isInteger(h.id) && h.id > 0 && h.id <= MAX_INT));
  assert.deepEqual(parsePrefs("%E0%A4%A"), { langs: [], hide: [] }); // malformed
});
