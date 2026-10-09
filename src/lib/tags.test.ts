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

import { squash, tagSurvivor } from "./tags";

test("spellings that differ only by hyphens share a key", () => {
  assert.equal(squash("blow-job"), squash("blowjob"));
  assert.notEqual(squash("blowjob-face"), squash("blowjob"));
});

test("the spelling with the most works survives, but a category keeps its spelled-out form", () => {
  const tags = [
    { id: 285, type: "TAG", slug: "blow-job", count: 335 },
    { id: 92, type: "TAG", slug: "blowjob", count: 704 },
  ];
  assert.equal(tagSurvivor(tags).slug, "blowjob");
  const cats = [
    { id: 440, type: "CATEGORY", slug: "artistcg", count: 50 },
    { id: 519, type: "CATEGORY", slug: "artist-cg", count: 140 },
    { id: 177, type: "CATEGORY", slug: "gamecg", count: 6 },
    { id: 3030, type: "CATEGORY", slug: "game-cg", count: 7 },
  ];
  assert.equal(tagSurvivor(cats.slice(0, 2)).slug, "artist-cg");
  assert.equal(tagSurvivor([cats[2], { ...cats[3], count: 1 }]).slug, "game-cg"); // the hyphenated form wins even with fewer works
});
