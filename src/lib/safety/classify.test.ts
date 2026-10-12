import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "./classify";

const base = { title: "Some Title", tags: [] as string[] };

test("clean work passes", () => {
  const r = classify({ ...base, tags: ["big breasts", "office lady", "romance"] });
  assert.equal(r.verdict, "CLEAN");
  assert.equal(r.deferFetch, false);
});

test("former hard tags create metadata-only drafts", () => {
  for (const tag of ["Lolicon", "LOLI", "shota", "Shotacon", "loli.", "toddlercon", "lolis", "shotas"]) {
    const r = classify({ ...base, tags: [tag] });
    assert.equal(r.verdict, "REVIEW", tag);
    assert.equal(r.deferFetch, true, tag);
  }
});

test("former hard terms in title and alt titles require approval before fetch", () => {
  assert.equal(classify({ title: "Loli Paradise", tags: [] }).deferFetch, true);
  assert.equal(classify({ title: "x", altTitles: ["Shotacon Days"], tags: [] }).deferFetch, true);
});

test("quarantine is whole-word: lookalikes do not trip it", () => {
  assert.equal(classify({ ...base, tags: ["childhood friend"] }).verdict, "CLEAN");
  assert.equal(classify({ ...base, tags: ["lolita fashion"] }).verdict, "CLEAN");
  assert.equal(classify({ title: "Shotaro's Day Off", tags: [] }).verdict, "CLEAN");
});

test("flagged terms in descriptions enter metadata-only review", () => {
  const r = classify({ ...base, description: "No loli or shota content, all characters are adults, not underage." });
  assert.equal(r.verdict, "REVIEW");
  assert.equal(r.deferFetch, true);
});

test("flagged terms in source tag lists pasted into descriptions require approval", () => {
  const description = "Two people meet.\n\nTags: Anal, blowjob, kimono, lolicon, maid, nakadashi, rape";
  const r = classify({ ...base, description });
  assert.equal(r.verdict, "REVIEW");
  assert.equal(r.deferFetch, true);
  for (const text of ["|FEMALE| anal, blowjob, lingerie, lolicon, maid", "lolicon", "loli, anal", "tags: shotacon.", "hidden sex; shota; maid", "anal / lolis / maid", "x, toddlercon"]) {
    assert.equal(classify({ ...base, description: text }).deferFetch, true, text);
  }
});

test("lookalikes do not trigger pre-download review", () => {
  for (const description of ["anal, lolita fashion, maid", "shotaro, maid", "anal, lolicons club, maid"]) {
    assert.equal(classify({ ...base, description }).verdict, "CLEAN", description);
  }
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
  assert.equal(classify({ ...base, tags: ["young wife", "loli"] }).deferFetch, true);
});

test("pre-download terms defer fetching and admin quarantine still takes precedence", () => {
  assert.equal(classify({ ...base, tags: ["school uniform", "loli"] }).deferFetch, true);
  const r = classify({ ...base, tags: ["school uniform", "underage"] });
  assert.equal(r.verdict, "REVIEW");
  assert.equal(r.deferFetch, true);
});

test("fullwidth forms normalise", () => {
  assert.equal(classify({ ...base, tags: ["ｌｏｌｉ"] }).deferFetch, true);
});

test("former hard terms are editable pre-download terms", () => {
  const empty = { quarantine: [], defer: [], review: [], allowed: [] };
  assert.equal(classify({ ...base, tags: ["loli"] }, empty).verdict, "CLEAN");
  assert.equal(classify({ ...base, tags: ["shotacon"] }, empty).verdict, "CLEAN");
  const configured = { ...empty, defer: ["loli", "shotacon"] };
  assert.equal(classify({ ...base, tags: ["loli"] }, configured).deferFetch, true);
  assert.equal(classify({ ...base, tags: ["school uniform"] }, empty).verdict, "CLEAN");
});

test("admins can add extra quarantine terms (stricter), and edit review/defer/allowed freely", () => {
  const t = { quarantine: ["custom banned"], defer: ["custom defer"], review: ["custom review"], allowed: ["custom review ok"] };
  assert.equal(classify({ ...base, tags: ["custom banned"] }, t).verdict, "QUARANTINE");
  assert.equal(classify({ ...base, tags: ["custom defer"] }, t).deferFetch, true);
  assert.equal(classify({ ...base, tags: ["custom review"] }, t).verdict, "REVIEW");
  assert.equal(classify({ ...base, tags: ["custom review ok"] }, t).verdict, "CLEAN");
});
