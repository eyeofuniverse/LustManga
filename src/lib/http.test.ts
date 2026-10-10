import { test } from "node:test";
import assert from "node:assert/strict";
import { Http } from "./http";

type Gated = { gap: () => Promise<void> };

// Timer assertions use generous tolerances: CI machines jitter. The bug these guard against produced a
// spacing of 0 ms (callers fired together), so a loose floor still catches it.

test("concurrent callers are spaced out (regression: they used to all fire together)", async () => {
  const h = new Http(100) as unknown as Gated;
  const t0 = Date.now();
  const stamps = await Promise.all(Array.from({ length: 6 }, async () => (await h.gap(), Date.now() - t0)));
  stamps.sort((a, b) => a - b);
  const spacing = Math.min(...stamps.slice(1).map((s, i) => s - stamps[i]));
  assert.ok(spacing >= 50, `smallest spacing was ${spacing} ms (the old bug gave 0)`);
  assert.ok(stamps[5] >= 350, `6 calls at a 100 ms gap should take about 500 ms, took ${stamps[5]} ms`);
});

test("a quiet period does not delay the next call", async () => {
  const h = new Http(80) as unknown as Gated;
  await h.gap();
  await new Promise((r) => setTimeout(r, 250));
  const t = Date.now();
  await h.gap();
  assert.ok(Date.now() - t < 70, "a call after an idle period should not be queued behind old slots");
});

import { gate } from "./http";

test("gate keeps at most N calls in flight, and runs every one", async () => {
  const run = gate(3);
  let active = 0;
  let peak = 0;
  const done: number[] = [];
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        done.push(i);
      }),
    ),
  );
  assert.equal(peak, 3);
  assert.equal(done.length, 20);
});

test("gate frees its slot when a call throws", async () => {
  const run = gate(1);
  await assert.rejects(() => run(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await run(async () => "next"), "next");
});
