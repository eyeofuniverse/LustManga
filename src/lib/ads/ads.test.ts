import { test } from "node:test";
import assert from "node:assert/strict";
import { SLOTS, SLOT_KEYS, bandOfDevice, bandsFor, defaultSize, onDevice, slotDef } from "./registry";
import { chooseAd, ctr, eligible, statusOf, type PoolAd } from "./select";
import { MAX_CODE, parseAdInput, safeUrl, when } from "./validate";

const NOW = new Date("2026-10-12T12:00:00Z");
const ad = (o: Partial<PoolAd> & { id: string }): PoolAd => ({ device: "all", priority: 0, weight: 1, active: true, startsAt: null, endsAt: null, ...o });

test("registry: keys are unique, every banner slot has a size on at least one device, sizes are sane", () => {
  assert.equal(new Set(SLOT_KEYS).size, SLOTS.length);
  for (const s of SLOTS) {
    assert.match(s.key, /^[a-z]+(-[a-z]+)+$/, s.key);
    if (s.kind === "banner") assert.ok(s.desktop || s.mobile, `${s.key} has no position`);
    for (const z of [s.desktop, s.mobile]) if (z) assert.ok(z.w >= 100 && z.w <= 970 && z.h >= 50 && z.h <= 600, `${s.key} ${z.w}x${z.h}`);
    assert.ok(s.label && s.where && s.tip, s.key);
  }
  assert.equal(SLOTS.filter((s) => s.kind === "popunder").length, 1);
});

test("registry: device bands and sizes follow the slot's definition", () => {
  const top = slotDef("home-top")!;
  assert.deepEqual(bandsFor(top), ["all", "desktop", "mobile"]);
  assert.deepEqual(defaultSize(top, "desktop"), { w: 728, h: 90 });
  assert.deepEqual(defaultSize(top, "mobile"), { w: 320, h: 100 });
  assert.equal(slotDef("nope"), null);
  assert.equal(bandOfDevice("tablet"), "desktop");
  assert.equal(bandOfDevice("mobile"), "mobile");
  assert.equal(onDevice(slotDef("global-popunder")!, "mobile"), true);
  // a slot with no phone position would never serve on a phone
  const desktopOnly = { ...top, mobile: null };
  assert.equal(onDevice(desktopOnly, "mobile"), false);
  assert.deepEqual(bandsFor(desktopOnly), ["all", "desktop"]);
});

test("selection: only live ads inside their schedule, for the visitor's device", () => {
  const ads = [
    ad({ id: "paused", active: false }),
    ad({ id: "future", startsAt: new Date("2026-10-13T00:00:00Z") }),
    ad({ id: "over", endsAt: new Date("2026-10-12T11:59:59Z") }),
    ad({ id: "phone", device: "mobile" }),
    ad({ id: "live" }),
  ];
  assert.equal(chooseAd(ads, "desktop", NOW)?.id, "live");
  assert.equal(chooseAd(ads.filter((a) => a.id !== "live"), "desktop", NOW), null, "nothing eligible: the slot stays empty");
  assert.equal(statusOf(ads[0]!, NOW), "paused");
  assert.equal(statusOf(ads[1]!, NOW), "scheduled");
  assert.equal(statusOf(ads[2]!, NOW), "ended");
  assert.equal(statusOf(ads[4]!, NOW), "live");
  // the schedule is half-open: it starts at startsAt and stops at endsAt
  assert.equal(eligible(ad({ id: "a", startsAt: NOW }), "desktop", NOW), true);
  assert.equal(eligible(ad({ id: "a", endsAt: NOW }), "desktop", NOW), false);
});

test("selection: an ad for the visitor's own device beats an 'all' ad, whatever the priority", () => {
  const ads = [ad({ id: "generic", priority: 50 }), ad({ id: "phone", device: "mobile", priority: -5 }), ad({ id: "pc", device: "desktop" })];
  assert.equal(chooseAd(ads, "mobile", NOW)?.id, "phone");
  assert.equal(chooseAd(ads, "desktop", NOW)?.id, "pc");
  assert.equal(chooseAd([ads[0]!], "mobile", NOW)?.id, "generic", "with nothing specific, the 'all' ad serves");
});

test("selection: highest priority wins; equals share by weight", () => {
  const ads = [ad({ id: "low", priority: 1 }), ad({ id: "a", priority: 5, weight: 1 }), ad({ id: "b", priority: 5, weight: 3 })];
  const counts: Record<string, number> = {};
  // a deterministic walk across [0, 1) stands in for randomness
  for (let i = 0; i < 400; i++) {
    const id = chooseAd(ads, "desktop", NOW, () => i / 400)!.id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  assert.equal(counts.low, undefined, "a lower priority never serves while a higher one is live");
  assert.equal(counts.a, 100);
  assert.equal(counts.b, 300);
  assert.equal(chooseAd(ads, "desktop", NOW, () => 0.999999)?.id, "b", "the top of the range is still a valid pick");
  assert.equal(chooseAd([ad({ id: "z", weight: 0 })], "desktop", NOW)?.id, "z", "a zero or missing weight counts as 1");
});

test("ctr is a percentage with two decimals", () => {
  assert.equal(ctr(1, 3), 33.33);
  assert.equal(ctr(5, 0), 0);
  assert.equal(ctr(0, 100), 0);
});

test("urls: only full http(s) addresses; images must be https; no logins, spaces or script schemes", () => {
  assert.equal(safeUrl("https://cdn.example.com/a.png", { httpsOnly: true }), "https://cdn.example.com/a.png");
  assert.equal(safeUrl("http://example.com/x"), "http://example.com/x");
  assert.equal(safeUrl("http://example.com/x", { httpsOnly: true }), null);
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "//example.com", "example.com", "ftp://x.com/a", "https://user:pw@x.com/", "https://x.com/a b", "", "   ", null, undefined, 5, "https://" + "a".repeat(2100) + ".com", "vbscript:x", "file:///etc/passwd"]) {
    assert.equal(safeUrl(bad as never), null, String(bad));
  }
});

test("dates: a datetime-local value is UTC; junk is rejected; empty is 'not set'", () => {
  assert.equal(when("")?.toISOString(), undefined);
  assert.equal(when(""), null);
  assert.equal(when("2026-10-12")?.toISOString(), "2026-10-12T00:00:00.000Z");
  assert.equal(when("2026-10-12T14:30")?.toISOString(), "2026-10-12T14:30:00.000Z");
  assert.equal(when("2026-10-12T14:30:15+02:00")?.toISOString(), "2026-10-12T12:30:15.000Z");
  for (const bad of ["tomorrow", "2026-13-40", "2026-10-12 14:30", "12/10/2026", "2026-10-12T25:00"]) assert.equal(when(bad), undefined, bad);
});

const code = { slot: "home-top", name: "ExoClick 728x90", type: "code", device: "desktop", code: '<script async src="https://a.example/ad-provider.js"></script><ins data-zoneid="1"></ins>', active: "on" };
const banner = { slot: "list-in-grid", name: "Direct deal", type: "banner", device: "all", imageUrl: "https://cdn.example.com/b.png", linkUrl: "https://shop.example/?ref=lp", alt: "Shop" };

test("admin input: a good ad code and a good banner are accepted and normalised", () => {
  const a = parseAdInput(code);
  assert.ok(a.ok);
  if (a.ok) {
    assert.equal(a.data.type, "code");
    assert.equal(a.data.isolation, "inline");
    assert.equal(a.data.imageUrl, null);
    assert.equal(a.data.priority, 0);
    assert.equal(a.data.weight, 1);
    assert.equal(a.data.active, true);
    assert.equal(a.data.width, null, "an empty size means the slot's own size");
  }
  const b = parseAdInput({ ...banner, width: "300", height: "250", priority: "10", weight: "3", startsAt: "2026-11-01T00:00", endsAt: "2026-12-01" });
  assert.ok(b.ok);
  if (b.ok) {
    assert.deepEqual([b.data.width, b.data.height, b.data.priority, b.data.weight], [300, 250, 10, 3]);
    assert.equal(b.data.code, null);
    assert.equal(b.data.startsAt?.toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(b.data.active, false, "an unticked 'live' box means paused");
  }
});

test("admin input: every way to save something broken is refused with a clear message", () => {
  const refuse = (o: Record<string, unknown>, re: RegExp) => {
    const r = parseAdInput(o);
    assert.equal(r.ok, false, JSON.stringify(o).slice(0, 80));
    if (!r.ok) assert.match(r.error, re);
  };
  refuse({ ...code, slot: "nope" }, /slot does not exist/);
  refuse({ ...code, name: "  " }, /name/);
  refuse({ ...code, name: "x".repeat(121) }, /too long/);
  refuse({ ...code, code: "  " }, /Paste the ad code/);
  refuse({ ...code, code: "x".repeat(MAX_CODE + 1) }, /too long/);
  refuse({ ...code, device: "tablet" }, /no position/);
  refuse({ ...banner, imageUrl: "http://cdn.example.com/b.png" }, /https/);
  refuse({ ...banner, imageUrl: "javascript:alert(1)" }, /https/);
  refuse({ ...banner, linkUrl: "javascript:alert(1)" }, /link address/);
  refuse({ ...banner, linkUrl: "not a url" }, /link address/);
  refuse({ ...banner, width: "0" }, /whole numbers/);
  refuse({ ...banner, height: "9999" }, /whole numbers/);
  refuse({ ...banner, width: "abc" }, /whole numbers/);
  refuse({ ...code, priority: "101" }, /Priority/);
  refuse({ ...code, priority: "1.5" }, /Priority/);
  refuse({ ...code, weight: "0" }, /Weight/);
  refuse({ ...code, startsAt: "soon" }, /valid dates/);
  refuse({ ...code, startsAt: "2026-12-01", endsAt: "2026-11-01" }, /after the start/);
  refuse({ ...code, startsAt: "2026-12-01", endsAt: "2026-12-01" }, /after the start/);
  // the pop-under is a script that has to run in the page
  refuse({ ...code, slot: "global-popunder", isolation: "frame" }, /cannot be isolated/);
  refuse({ ...banner, slot: "global-popunder", device: "all" }, /pop-under is a script/);
});

test("admin input: isolation only applies to ad code, and the slot's device bands are respected", () => {
  const framed = parseAdInput({ ...code, isolation: "frame" });
  assert.ok(framed.ok && framed.data.isolation === "frame");
  const bannerFramed = parseAdInput({ ...banner, isolation: "frame" });
  assert.ok(bannerFramed.ok && bannerFramed.data.isolation === "inline", "a banner has nothing to isolate");
  assert.ok(parseAdInput({ ...code, slot: "global-popunder", device: "mobile", name: "pop", code: "<script></script>" }).ok);
});
