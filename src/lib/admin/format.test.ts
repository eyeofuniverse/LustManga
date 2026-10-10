import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, barWidths, dayBuckets, duration, fmtBytes, initials, reasonParts, stamp } from "./format";

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);

test("ago reads naturally and never goes negative", () => {
  assert.equal(ago(null, NOW), "never");
  assert.equal(ago("nonsense", NOW), "never");
  assert.equal(ago(NOW - 10_000, NOW), "just now");
  assert.equal(ago(NOW + 60_000, NOW), "just now"); // a clock a little ahead is not "-1m ago"
  assert.equal(ago(NOW - 5 * 60_000, NOW), "5m ago");
  assert.equal(ago(NOW - 3 * 3_600_000, NOW), "3h ago");
  assert.equal(ago(NOW - 3 * 86_400_000, NOW), "3d ago");
  assert.equal(ago(NOW - 90 * 86_400_000, NOW), "2026-07-13");
});

test("fmtBytes", () => {
  assert.equal(fmtBytes(0), "0 B");
  assert.equal(fmtBytes(512), "512 B");
  assert.equal(fmtBytes(1536), "1.5 KB");
  assert.equal(fmtBytes(3_200_000_000), "3.2 GB");
  assert.equal(fmtBytes(250_000_000_000), "250 GB");
  assert.equal(fmtBytes(Number.NaN), "0 B");
});

test("durations", () => {
  const t = Date.UTC(2026, 9, 11, 12, 0, 0);
  assert.equal(duration(t, t + 42_000), "42s");
  assert.equal(duration(t, t + 365_000), "6m 05s");
  assert.equal(duration(t, t + 4_320_000), "1h 12m");
  assert.equal(duration(t, null), "running");
});

test("bars are relative to the biggest, and a small non-zero value stays visible", () => {
  assert.deepEqual(barWidths([100, 50, 0]), [100, 50, 0]);
  assert.deepEqual(barWidths([1000, 1]), [100, 3]);
  assert.deepEqual(barWidths([0, 0]), [0, 0]);
  assert.deepEqual(barWidths([]), []);
});

test("a per-day series has a value for every day, oldest first", () => {
  const today = new Date(Date.UTC(2026, 9, 11, 23, 59));
  const out = dayBuckets([{ day: "2026-10-10T00:00:00.000Z", n: 4 }, { day: "2026-10-08", n: 7 }], 5, today);
  assert.deepEqual(out, [
    { day: "2026-10-07", n: 0 },
    { day: "2026-10-08", n: 7 },
    { day: "2026-10-09", n: 0 },
    { day: "2026-10-10", n: 4 },
    { day: "2026-10-11", n: 0 },
  ]);
});

test("initials and reasons and stamps", () => {
  assert.equal(initials("me.minhajrahman@gmail.com"), "MM");
  assert.equal(initials("alex@x.com"), "A");
  assert.equal(initials("@x.com"), "?");
  assert.deepEqual(reasonParts("tag:school uniform"), { field: "tag", term: "school uniform" });
  assert.deepEqual(reasonParts("plain"), { field: "", term: "plain" });
  assert.equal(stamp(NOW), "2026-10-11 12:00");
});
