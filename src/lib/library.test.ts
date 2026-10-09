import { test } from "node:test";
import assert from "node:assert/strict";
import { isFinished, parseBackup, resumePoint, type HistoryEntry } from "./library";

const h = (ch: number, page: number, total: number): HistoryEntry => ({ id: 1, ch, page, total, at: 0, done: [ch] });
const chapters = [1, 2, 3];

test("no history starts at the first chapter", () => {
  assert.deepEqual(resumePoint(undefined, chapters), { ch: 1, kind: "start" });
  assert.deepEqual(resumePoint(undefined, []), { ch: 1, kind: "start" });
});

test("mid-chapter resumes on that page", () => {
  assert.deepEqual(resumePoint(h(2, 7, 30), chapters), { ch: 2, page: 7, kind: "continue" });
});

test("having only opened the first page is still a fresh start", () => {
  assert.deepEqual(resumePoint(h(1, 1, 30), chapters), { ch: 1, kind: "start" });
  assert.deepEqual(resumePoint(h(2, 1, 30), chapters), { ch: 2, kind: "continue" });
});

test("a finished chapter moves on to the next one instead of landing on its last page", () => {
  assert.equal(isFinished(h(1, 30, 30)), true);
  assert.deepEqual(resumePoint(h(1, 30, 30), chapters), { ch: 2, kind: "next" });
});

test("finishing the last chapter offers to read again from the beginning", () => {
  assert.deepEqual(resumePoint(h(3, 12, 12), chapters), { ch: 1, kind: "again" });
  assert.deepEqual(resumePoint(h(1, 30, 30), [1]), { ch: 1, kind: "again" }); // a one-shot
});

test("history for a chapter that no longer exists falls back to the start", () => {
  assert.deepEqual(resumePoint(h(9, 5, 30), chapters), { ch: 1, kind: "start" });
});

test("a backup is validated field by field and never trusted", () => {
  const good = JSON.stringify({
    v: 1, at: 5, fav: [1, 2, -3, "x", 99999999999, 4], follow: [{ id: 7, type: "artist", slug: "a", name: "A" }, { id: 8, type: "", slug: "b", name: "B" }, { nope: 1 }],
    history: [{ id: 1, ch: 2, page: 5, total: 30, at: 10, done: [1, 2, "x"] }, { id: "bad" }, { id: 2 }],
    reader: { mode: "scroll", rtl: true, spread: "off", width: 99999, dim: -5, hax: 1 }, prefs: { langs: ["en", "../x", "ja"], hide: [{ id: 3, name: "n" }, { id: 0, name: "z" }] },
  });
  const b = parseBackup(good)!;
  assert.deepEqual(b.fav, [1, 2, 4]);
  assert.deepEqual(b.follow, [{ id: 7, type: "artist", slug: "a", name: "A" }]);
  assert.equal(b.history.length, 2);
  assert.deepEqual(b.history[0].done, [1, 2]);
  assert.deepEqual(b.history[1], { id: 2, ch: 1, page: 1, total: 1, at: 0, done: [] });
  assert.deepEqual(b.reader, { mode: "scroll", rtl: true, spread: "off", width: 1400, dim: 0 });
  assert.deepEqual(b.prefs, { langs: ["en", "ja"], hide: [{ id: 3, name: "n" }] });
});

test("a file that is not a backup is refused", () => {
  assert.equal(parseBackup("not json"), null);
  assert.equal(parseBackup("[]"), null);
  assert.equal(parseBackup(JSON.stringify({ v: 2 })), null);
  assert.equal(parseBackup("x".repeat(2_000_001)), null);
  assert.deepEqual(parseBackup(JSON.stringify({ v: 1 }))?.fav, []);
});
