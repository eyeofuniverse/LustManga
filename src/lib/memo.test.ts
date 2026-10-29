import { test } from "node:test";
import assert from "node:assert/strict";
import { memo } from "./memo";

test("the same arguments are answered once, different arguments separately", async () => {
  let calls = 0;
  const f = memo(60, async (n: number) => (calls++, n * 2));
  assert.equal(await f(2), 4);
  assert.equal(await f(2), 4);
  assert.equal(await f(3), 6);
  assert.equal(calls, 2);
});

test("callers that arrive while the first read is running share it", async () => {
  let calls = 0;
  const f = memo(60, async () => (calls++, await new Promise((r) => setTimeout(r, 20)), "x"));
  assert.deepEqual(await Promise.all([f(), f(), f()]), ["x", "x", "x"]);
  assert.equal(calls, 1);
});

test("a failed first read is not remembered", async () => {
  let calls = 0;
  const f = memo(60, async () => {
    if (calls++ === 0) throw new Error("boom");
    return "ok";
  });
  await assert.rejects(f(), /boom/);
  assert.equal(await f(), "ok");
});

test("a stale answer is served at once while one refresh runs", async () => {
  let n = 0;
  const f = memo(0.01, async () => ++n);
  assert.equal(await f(), 1);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(await f(), 1); // stale, served immediately
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(await f(), 2); // the refresh landed
});

test("a failed refresh keeps serving the old answer", async () => {
  let n = 0;
  const f = memo(0.01, async () => {
    if (++n > 1) throw new Error("db down");
    return "old";
  });
  assert.equal(await f(), "old");
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(await f(), "old");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(await f(), "old");
});

test("the cache stays within its size", async () => {
  let calls = 0;
  const f = memo(60, async (n: number) => (calls++, n), 3);
  for (const n of [1, 2, 3, 4]) await f(n);
  await f(1); // evicted, so read again
  assert.equal(calls, 5);
});

test("Dates survive", async () => {
  const d = new Date();
  const f = memo(60, async () => ({ d }));
  assert.ok((await f()).d instanceof Date);
});
