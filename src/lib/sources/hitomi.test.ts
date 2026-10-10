import { test } from "node:test";
import assert from "node:assert/strict";
import { retryDelayMs } from "./hitomi";

test("retries wait longer each time, capped, with a little jitter", () => {
  assert.equal(retryDelayMs(0, null, 0), 1500);
  assert.equal(retryDelayMs(1, null, 0), 3000);
  assert.equal(retryDelayMs(2, null, 0), 6000);
  assert.equal(retryDelayMs(3, null, 0), 12000);
  assert.equal(retryDelayMs(10, null, 0), 30000); // never more than 30 s
  assert.equal(retryDelayMs(0, null, 0.999), 1999); // jitter stays under half a second
});

test("a Retry-After from the server wins, up to a minute", () => {
  assert.equal(retryDelayMs(0, "7"), 7000);
  assert.equal(retryDelayMs(0, "600"), 60000);
  assert.equal(retryDelayMs(1, "not a number", 0), 3000); // an unreadable header is ignored
});
