import { test } from "node:test";
import assert from "node:assert/strict";
import { isFinished, resumePoint, type HistoryEntry } from "./library";

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
