import { test } from "node:test";
import assert from "node:assert/strict";
import { langName, normLang, slug } from "./tags";

test("ASCII names slugify as before", () => {
  assert.equal(slug("Big Breasts"), "big-breasts");
  assert.equal(slug("Pokémon"), "pokemon");
  assert.equal(slug("  Spaced   Out  "), "spaced-out");
});

test("non-Latin names keep a real slug (regression: they became empty and were dropped)", () => {
  for (const name of ["ぴんく", "한국어", "Привет", "夢"]) assert.notEqual(slug(name), "", name);
});

test("different non-Latin names do not collide (regression: 'Foo 夢' and 'Foo 愛' both became 'foo')", () => {
  assert.notEqual(slug("Foo 夢"), slug("Foo 愛"));
  assert.notEqual(slug("ぴんく"), slug("あおい"));
});

test("punctuation-only and empty names give an empty slug (so they are skipped)", () => {
  assert.equal(slug(""), "");
  assert.equal(slug("!!!"), "");
});

test("language helpers", () => {
  assert.equal(normLang("pt-br"), "pt");
  assert.equal(normLang("ZH-HK"), "zh");
  assert.equal(langName("es-la"), "spanish");
});
