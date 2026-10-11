import { test } from "node:test";
import assert from "node:assert/strict";
import { normalisePath } from "./paths";
import { browserOf, describe, deviceOf, isBot, osOf } from "./ua";
import { classifyReferrer, cleanTag } from "./referrer";
import { ipKey, visitorId } from "./visitor";
import { checkEvent, parseBody } from "./payload";
import { optedOut } from "./collect";

const KEY = "a-test-secret-that-is-long-enough";

test("paths: a work page is counted by id, whatever the slug or query says", () => {
  assert.deepEqual(normalisePath("/g/5966-some-title?x=1#top"), { path: "/g/5966", kind: "work", workId: 5966 });
  assert.deepEqual(normalisePath("/g/5966-%E4%BC%9A%E7%A4%BE"), { path: "/g/5966", kind: "work", workId: 5966 });
  assert.deepEqual(normalisePath("/g/5966"), { path: "/g/5966", kind: "work", workId: 5966 });
  assert.equal(normalisePath("/g/abc")?.kind, "other");
  assert.equal(normalisePath("/g/0-x")?.kind, "other");
  assert.equal(normalisePath("/g/99999999999-x")?.kind, "other");
});

test("paths: the reader drops the chapter, listings keep their slug", () => {
  assert.deepEqual(normalisePath("/read/12/3?p=8"), { path: "/read/12", kind: "read", workId: 12 });
  assert.deepEqual(normalisePath("/tag/big-breasts?sort=new&page=3"), { path: "/tag/big-breasts", kind: "tag", workId: null });
  assert.equal(normalisePath("/category/game-cg")?.kind, "tag");
  assert.equal(normalisePath("/artists")?.kind, "list");
  assert.equal(normalisePath("/browse?lang=en")?.path, "/browse");
  assert.equal(normalisePath("/")?.kind, "home");
  assert.equal(normalisePath("/search?q=secret")?.path, "/search");
  assert.equal(normalisePath("/favorites")?.kind, "user");
  assert.equal(normalisePath("/privacy")?.kind, "static");
});

test("paths: the console, the API and junk are never tracked", () => {
  for (const p of ["/console", "/console/works", "/api/t", "/_next/static/x.js", "/console-preview/x"]) assert.equal(normalisePath(p), null, p);
  for (const p of ["", "g/1", "//evil.com", "http://x.com/", 5, null, undefined, "/a\u0000b", "/" + "a".repeat(500)]) {
    const r = normalisePath(p as never);
    // "//evil.com" collapses to a harmless path; everything else must be rejected
    if (p === "//evil.com") assert.equal(r?.path, "/evil.com");
    else assert.equal(r, null, String(p));
  }
  assert.equal(normalisePath("/console/")?.path, undefined);
});

test("paths: a long unknown path is cut, a trailing slash is ignored", () => {
  assert.equal(normalisePath("/" + "a".repeat(300))!.path.length, 120);
  assert.equal(normalisePath("/browse/")?.path, "/browse");
});

test("user agents: robots and tools are recognised, real browsers are not", () => {
  const bots = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 11; Moto G Power) AppleWebKit/537.36 Chrome-Lighthouse",
    "python-requests/2.31.0",
    "curl/8.4.0",
    "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
    "",
    "x",
  ];
  for (const ua of bots) assert.equal(isBot(ua), true, ua);
  const humans = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 DuckDuckGo/7 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 [Pinterest/Android]",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  ];
  for (const ua of humans) assert.equal(isBot(ua), false, ua);
});

test("user agents: device, browser and system", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const ipad = "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
  const androidPhone = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
  const androidTablet = "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
  assert.deepEqual(describe(iphone), { device: "mobile", browser: "Safari", os: "iOS" });
  assert.deepEqual(describe(ipad), { device: "tablet", browser: "Safari", os: "iOS" });
  assert.deepEqual(describe(mac), { device: "desktop", browser: "Safari", os: "macOS" });
  assert.deepEqual(describe(mac, true), { device: "tablet", browser: "Safari", os: "iOS" }, "a Mac with a touch screen is an iPad");
  assert.equal(deviceOf(androidPhone), "mobile");
  assert.equal(deviceOf(androidTablet), "tablet");
  assert.equal(browserOf(edge), "Edge");
  assert.equal(osOf(edge), "Windows");
  assert.equal(browserOf("Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0"), "Firefox");
  assert.equal(browserOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1"), "Chrome");
});

test("referrers: search, social, referral, own site, and nonsense", () => {
  const own = ["lustpages.com", "www.lustpages.com"];
  assert.deepEqual(classifyReferrer("https://www.google.com/", own), { host: "google.com", kind: "search" });
  assert.deepEqual(classifyReferrer("https://www.google.co.uk/search?q=hentai", own), { host: "google.co.uk", kind: "search" });
  assert.deepEqual(classifyReferrer("https://duckduckgo.com/", own), { host: "duckduckgo.com", kind: "search" });
  assert.deepEqual(classifyReferrer("android-app://com.google.android.googlequicksearchbox/", own), { host: "com.google.android.googlequicksearchbox", kind: "search" });
  assert.deepEqual(classifyReferrer("https://old.reddit.com/r/x/comments/1", own), { host: "old.reddit.com", kind: "social" });
  assert.deepEqual(classifyReferrer("https://t.co/abc", own), { host: "t.co", kind: "social" });
  assert.deepEqual(classifyReferrer("https://some-blog.example/post", own), { host: "some-blog.example", kind: "referral" });
  assert.deepEqual(classifyReferrer("https://lustpages.com/browse", own), { host: null, kind: "direct" });
  assert.deepEqual(classifyReferrer("https://www.lustpages.com/", own), { host: null, kind: "direct" });
  assert.deepEqual(classifyReferrer("https://cdn.lustpages.com/", own), { host: null, kind: "direct" }, "a subdomain of ours is ours");
  assert.deepEqual(classifyReferrer("https://notlustpages.com/", own), { host: "notlustpages.com", kind: "referral" }, "a look-alike is not ours");
  for (const bad of ["", undefined, null, 7, "not a url", "javascript:alert(1)", "https://" + "a".repeat(200) + ".com", "ftp://x.com"]) {
    assert.deepEqual(classifyReferrer(bad, own), { host: null, kind: "direct" }, String(bad));
  }
  // only the host survives: a search query or a private address in the path is dropped
  assert.equal(classifyReferrer("https://bing.com/search?q=my+secret+query", own).host, "bing.com");
});

test("campaign tags are short, lower-case and free of control characters", () => {
  assert.equal(cleanTag("  Newsletter\u0000 "), "newsletter");
  assert.equal(cleanTag("x".repeat(200))!.length, 60);
  assert.equal(cleanTag(""), null);
  assert.equal(cleanTag(5), null);
});

test("visitor ids: stable within a day, different across days, browsers and networks, and never the address", () => {
  const ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/124";
  const d1 = new Date("2026-10-11T03:00:00Z");
  const same = new Date("2026-10-11T23:59:59Z");
  const next = new Date("2026-10-12T00:00:01Z");
  const a = visitorId("203.0.113.9", ua, d1, KEY)!;
  assert.match(a, /^[0-9a-f]{20}$/);
  assert.equal(visitorId("203.0.113.9", ua, same, KEY), a, "one browser, one day, one id");
  assert.notEqual(visitorId("203.0.113.9", ua, next, KEY), a, "tomorrow is a different id: nobody is followed across days");
  assert.notEqual(visitorId("203.0.113.10", ua, d1, KEY), a);
  assert.notEqual(visitorId("203.0.113.9", ua + "x", d1, KEY), a);
  assert.notEqual(visitorId("203.0.113.9", ua, d1, KEY + "x"), a, "the secret is part of it");
  assert.ok(!a.includes("203") || !/203\.0\.113/.test(a));
  assert.equal(visitorId("203.0.113.9", ua, d1, null), null, "no secret: nothing is recorded");
});

test("IPv6 addresses count by their /64, because browsers rotate the rest", () => {
  assert.equal(ipKey("2001:db8:85a3:8d3:1319:8a2e:370:7348"), ipKey("2001:db8:85a3:8d3:ffff:ffff:ffff:ffff"));
  assert.equal(ipKey("2001:db8::1"), ipKey("2001:0db8:0000:0000:aaaa::2"));
  assert.notEqual(ipKey("2001:db8:85a3:8d3::1"), ipKey("2001:db8:85a3:8d4::1"));
  assert.equal(ipKey("203.0.113.9"), "203.0.113.9");
  assert.equal(ipKey("::1"), "0000:0000:0000:0000");
});

const id = "abcdefghijkl";
test("payload: valid items pass, invalid ones are dropped without losing the rest", () => {
  const items = parseBody({
    items: [
      { t: "view", id, path: "/g/1-x", ref: "https://google.com/", gate: false },
      { t: "view", id: "short", path: "/" },
      { t: "leave", id, sec: 12 },
      { t: "leave", id, sec: 99999 },
      { t: "ev", id: "abcdefghijkm", n: "search", label: "big breasts", v: 12 },
      { t: "ev", id: "abcdefghijkn", n: "nope" },
      { t: "vit", path: "/", items: [{ m: "LCP", v: 1800.4, r: "good" }] },
      { t: "vit", path: "/", items: [{ m: "XYZ", v: 1, r: "good" }] },
      "junk",
      null,
    ],
  });
  assert.deepEqual(items!.map((i) => i.t), ["view", "leave", "ev", "vit"]);
  assert.equal(parseBody({}), null);
  assert.equal(parseBody([]), null);
  assert.equal(parseBody(null), null);
  assert.equal(parseBody({ items: "x" }), null);
});

test("payload: control characters are stripped and the batch is capped", () => {
  const r = parseBody({ items: [{ t: "ev", id, n: "search", label: "a\u0000b\u0007c  " }] })!;
  assert.equal((r[0] as { label: string }).label, "abc");
  const many = parseBody({ items: Array.from({ length: 100 }, () => ({ t: "leave", id, sec: 1 })) })!;
  assert.equal(many.length, 25);
});

test("events: each kind needs the right fields and nothing else survives", () => {
  const ev = (o: object) => ({ t: "ev" as const, id, ...o }) as Parameters<typeof checkEvent>[0];
  assert.deepEqual(checkEvent(ev({ n: "search", label: "  Big   Breasts ", v: 3 })), { name: "search", workId: null, label: "big breasts", value: 3, total: null });
  assert.equal(checkEvent(ev({ n: "search", label: "mail me at a@b.com" })), null, "an email address typed into the search box is not stored");
  assert.equal(checkEvent(ev({ n: "search", label: "call 0123456789012" })), null);
  assert.equal(checkEvent(ev({ n: "search", label: "see https://x.com/y" })), null);
  assert.equal(checkEvent(ev({ n: "search", label: "   " })), null);
  assert.equal(checkEvent(ev({ n: "read_start" })), null, "needs a work");
  assert.equal(checkEvent(ev({ n: "read_start", work: 5, v: 2 }))?.value, 2);
  assert.equal(checkEvent(ev({ n: "read_end", work: 5, v: 31, tot: 30 }))?.value, 31, "the end card counts as page total + 1");
  assert.equal(checkEvent(ev({ n: "read_end", work: 5, v: 32, tot: 30 })), null, "past the end is nonsense");
  assert.equal(checkEvent(ev({ n: "read_end", work: 5, v: 3 })), null, "needs the page count");
  assert.equal(checkEvent(ev({ n: "favorite", work: 5, label: "add" }))?.label, "add");
  assert.equal(checkEvent(ev({ n: "favorite", work: 5, label: "banana" })), null);
  assert.equal(checkEvent(ev({ n: "age_gate", label: "pass" }))?.label, "pass");
  assert.equal(checkEvent(ev({ n: "age_gate", label: "fail" })), null);
  assert.equal(checkEvent(ev({ n: "not_found" }))?.name, "not_found");
});

test("opt-out: Do Not Track, Global Privacy Control, test runs and signed-in admins are not measured", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  assert.equal(optedOut(h({})), false);
  assert.equal(optedOut(h({ dnt: "1" })), true);
  assert.equal(optedOut(h({ dnt: "0" })), false);
  assert.equal(optedOut(h({ "sec-gpc": "1" })), true);
  assert.equal(optedOut(h({ cookie: "lm_nocount=1" })), true);
  assert.equal(optedOut(h({ cookie: "a=1; lm_nocount=1" })), true);
  assert.equal(optedOut(h({ cookie: "xlm_nocount=1" })), false);
  assert.equal(optedOut(h({ cookie: "__Host-lm_session=abc" })), true);
  assert.equal(optedOut(h({ cookie: "lm_session=abc" })), true);
  assert.equal(optedOut(h({ cookie: "lm_age=1; lmv5=1" })), false);
});
