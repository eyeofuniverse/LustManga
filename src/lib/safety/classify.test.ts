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

test("prose in a description never causes quarantine or defer, even when it names a hard term", () => {
  const r = classify({ ...base, description: "No loli or shota content, all characters are adults, not underage." });
  assert.equal(r.verdict, "CLEAN");
  for (const prose of ["A story about a lolicon who learns better.", "Shota is the hero's name here", "He hates loli. She hates shota!", "Not lolicon, not shotacon, just adults"]) {
    assert.equal(classify({ ...base, description: prose }).verdict, "CLEAN", prose);
  }
});

test("a hard term that is an entry of a tag list pasted into the description quarantines (MangaDex puts the source's tags there)", () => {
  const pasted = "Two people meet.\n\nTags: Anal, blowjob, kimono, lolicon, maid, nakadashi, rape";
  const r = classify({ ...base, description: pasted });
  assert.equal(r.verdict, "QUARANTINE");
  assert.deepEqual(r.reasons, ["description:lolicon"]);
  for (const list of ["|FEMALE| anal, blowjob, lingerie, lolicon, maid", "lolicon", "loli, anal", "tags: shotacon.", "hidden sex; shota; maid", "• loli\n• maid", "anal / lolis / maid", "x, toddlercon"]) {
    assert.equal(classify({ ...base, description: list }).verdict, "QUARANTINE", list);
  }
});

test("list entries must be the whole entry: lookalikes inside longer words or phrases do not trip it", () => {
  for (const d of ["anal, lolita fashion, maid", "tags: loli pop candy, maid", "anal, not loli content, maid", "shotaro, maid", "anal, lolicons club, maid", "a b, c lolicon d, e"]) {
    assert.equal(classify({ ...base, description: d }).verdict, "CLEAN", d);
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

test("core quarantine terms hold even when the supplied term set is empty", () => {
  const empty = { quarantine: [], defer: [], review: [], allowed: [] };
  assert.equal(classify({ ...base, tags: ["loli"] }, empty).verdict, "QUARANTINE");
  assert.equal(classify({ ...base, tags: ["shotacon"] }, empty).verdict, "QUARANTINE");
  assert.equal(classify({ ...base, tags: ["school uniform"] }, empty).verdict, "CLEAN");
});

test("admins can add extra quarantine terms (stricter), and edit review/defer/allowed freely", () => {
  const t = { quarantine: ["custom banned"], defer: ["custom defer"], review: ["custom review"], allowed: ["custom review ok"] };
  assert.equal(classify({ ...base, tags: ["custom banned"] }, t).verdict, "QUARANTINE");
  assert.equal(classify({ ...base, tags: ["custom defer"] }, t).deferFetch, true);
  assert.equal(classify({ ...base, tags: ["custom review"] }, t).verdict, "REVIEW");
  assert.equal(classify({ ...base, tags: ["custom review ok"] }, t).verdict, "CLEAN");
});
