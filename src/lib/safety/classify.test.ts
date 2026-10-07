import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "./classify";

const base = { title: "Some Title", tags: [] as string[] };

test("clean work passes", () => {
  const r = classify({ ...base, tags: ["big breasts", "office lady", "romance"] });
  assert.equal(r.verdict, "CLEAN");
  assert.equal(r.deferFetch, false);
});

test("the five hard tags quarantine, regardless of case and punctuation", () => {
  for (const tag of ["Lolicon", "LOLI", "shota", "Shotacon", "loli.", "toddlercon", "lolis", "shotas"]) {
    assert.equal(classify({ ...base, tags: [tag] }).verdict, "QUARANTINE", tag);
  }
});

test("quarantine on title and alt titles", () => {
  assert.equal(classify({ title: "Loli Paradise", tags: [] }).verdict, "QUARANTINE");
  assert.equal(classify({ title: "x", altTitles: ["Shotacon Days"], tags: [] }).verdict, "QUARANTINE");
});

test("quarantine is whole-word: lookalikes do not trip it", () => {
  assert.equal(classify({ ...base, tags: ["childhood friend"] }).verdict, "CLEAN");
  assert.equal(classify({ ...base, tags: ["lolita fashion"] }).verdict, "CLEAN");
  assert.equal(classify({ title: "Shotaro's Day Off", tags: [] }).verdict, "CLEAN");
});

test("description never causes quarantine or defer, even with a hard term", () => {
  const r = classify({ ...base, description: "No loli or shota content, all characters are adults, not underage." });
  assert.equal(r.verdict, "CLEAN");
});

test("explicit age markers are held for admin WITHOUT downloading (deferFetch)", () => {
  for (const tag of ["underage", "preteen", "elementary school", "kindergarten", "toddler", "infant"]) {
    const r = classify({ ...base, tags: [tag] });
    assert.equal(r.verdict, "REVIEW", tag);
    assert.equal(r.deferFetch, true, tag);
  }
});

test("these former hard terms now go to the admin, not a rejection", () => {
  for (const tag of ["little girl", "young boy"]) {
    const r = classify({ ...base, tags: [tag] });
    assert.equal(r.verdict, "REVIEW", tag);
    assert.equal(r.deferFetch, false, tag);
  }
});

test("review terms hold work as REVIEW with reasons", () => {
  const r = classify({ ...base, tags: ["school uniform"] });
  assert.equal(r.verdict, "REVIEW");
  assert.deepEqual(r.reasons, ["tag:school uniform"]);
  assert.equal(classify({ ...base, tags: ["schoolgirl"] }).verdict, "REVIEW");
  assert.equal(classify({ title: "My Little Sister", tags: [] }).verdict, "REVIEW");
});

test("review also looks at the description", () => {
  const r = classify({ ...base, description: "A teenager moves to the city." });
  assert.equal(r.verdict, "REVIEW");
  assert.equal(r.deferFetch, false);
  assert.deepEqual(r.reasons, ["description:teenager"]);
});

test("allowed adult context is not flagged", () => {
  assert.equal(classify({ ...base, tags: ["college student"] }).verdict, "CLEAN");
  assert.equal(classify({ ...base, tags: ["young wife"] }).verdict, "CLEAN");
  assert.equal(classify({ ...base, description: "A young woman and a university student meet." }).verdict, "CLEAN");
});

test("allowed context does not shield a separate flagged term", () => {
  assert.equal(classify({ ...base, tags: ["college student", "schoolgirl"] }).verdict, "REVIEW");
  assert.equal(classify({ ...base, tags: ["young wife", "loli"] }).verdict, "QUARANTINE");
});

test("quarantine outranks defer outranks review", () => {
  assert.equal(classify({ ...base, tags: ["school uniform", "loli"] }).verdict, "QUARANTINE");
  const r = classify({ ...base, tags: ["school uniform", "underage"] });
  assert.equal(r.verdict, "REVIEW");
  assert.equal(r.deferFetch, true);
});

test("fullwidth forms normalise", () => {
  assert.equal(classify({ ...base, tags: ["ｌｏｌｉ"] }).verdict, "QUARANTINE");
});
