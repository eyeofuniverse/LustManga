import { test } from "node:test";
import assert from "node:assert/strict";
import { Http } from "./http";

type Gated = { gap: () => Promise<void> };

test("concurrent callers are spaced by the minimum gap (regression: they used to all fire together)", async () => {
  const h = new Http(100) as unknown as Gated;
  const t0 = Date.now();
  const stamps = await Promise.all(Array.from({ length: 6 }, async () => (await h.gap(), Date.now() - t0)));
  stamps.sort((a, b) => a - b);
  const spacing = Math.min(...stamps.slice(1).map((s, i) => s - stamps[i]));
  assert.ok(spacing >= 90, `smallest spacing was ${spacing} ms`);
  assert.ok(stamps[5] >= 450, `6 calls at a 100 ms gap should take about 500 ms, took ${stamps[5]} ms`);
});

test("a quiet period does not delay the next call", async () => {
  const h = new Http(80) as unknown as Gated;
  await h.gap();
  await new Promise((r) => setTimeout(r, 200));
  const t = Date.now();
  await h.gap();
  assert.ok(Date.now() - t < 40, "call after an idle period should be immediate");
});
