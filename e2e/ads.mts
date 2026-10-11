// Advertising, end to end: the admin actions, what the public site serves (and to whom), the counters, and a real browser.
//   (the normal production server, with analytics off)   BASE_URL=http://localhost:3200 npm run ads:test
// Everything it creates is named "zz-test ..." and removed again at the end (and at the start, if a run was cut short).
// The test ads are real rows in the database that the live site also reads, so they are visible to real visitors for as long as
// the test runs. To keep that to a minute or two, run it against a server started with a one-second ad cache (no long waits):
//   ADS_CACHE_SECONDS=1 NEXT_PUBLIC_SITE_URL=http://localhost:3200 npx next start -p 3201
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { prisma, db } from "../src/lib/db";
import { AGE_COOKIE } from "../src/lib/prefs";
import { CODE_OWNER_ONLY, deleteAd, duplicateAd, MAX_ADS_PER_SLOT, saveAd, setAdActive, setAdsEnabled } from "../src/lib/admin/ads-core";

const BASE = (process.env.BASE_URL ?? "http://localhost:3200").replace(/\/$/, "");
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const BOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const ME = { id: "zz-test-admin", email: "zz-test@test.invalid" };
const IMG = "https://img-cdn.lustpages.com/c/cmuz8jcez00j11oz9zg6ad513.webp";

let fails = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? `  [${extra}]` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** (runs in the browser) how many works come before the ad's visible copy in the grid; -1 if no copy is showing */
const worksBefore = (id: string) => {
  const li = [...document.querySelectorAll(`[data-ad-id="${id}"]`)].map((e) => e.closest("li") as HTMLElement).find((l) => l && l.offsetParent !== null);
  if (!li) return -1;
  const row = [...li.parentElement!.children];
  return row.slice(0, row.indexOf(li)).filter((c) => c.querySelector("article")).length;
};

/** The ad lists are cached; after the cache time passes the next request is answered with the old list while a fresh one is fetched. Warm it. */
const settle = async () => {
  await sleep(1500);
  await Promise.all(["/", "/browse", "/search?q=school", `/g/${workId}`, ...(short ? [`/read/${short.publicId}/1`] : [])].map((x) => page(x)));
  await sleep(1500);
};
const retry = <T,>(fn: () => Promise<T>) => db(fn, 8);
async function cleanup() {
  await retry(() => prisma.ad.deleteMany({ where: { name: { startsWith: "zz-test" } } })); // their daily counts go with them
  await retry(() => prisma.auditLog.deleteMany({ where: { actorEmail: ME.email } }));
}

async function page(path: string, o: { ua?: string; cookie?: string } = {}) {
  const r = await fetch(`${BASE}${path}`, { headers: { "user-agent": o.ua ?? DESKTOP, ...(o.cookie ? { cookie: o.cookie } : {}) }, redirect: "manual" });
  return { status: r.status, html: await r.text() };
}
const has = (html: string, ad: { id: string }) => html.includes(`data-ad-id="${ad.id}"`);

const create = async (raw: Record<string, unknown>) => {
  const r = await saveAd(prisma, ME, null, { active: "on", ...raw });
  if (!r.ok) throw new Error(`setup failed: ${r.message}`);
  return { id: r.id! };
};
const banner = (slot: string, name: string, o: Record<string, unknown> = {}) => create({ slot, name: `zz-test ${name}`, type: "banner", device: "all", imageUrl: IMG, linkUrl: "https://example.com/offer?x=1", alt: name, width: 300, height: 100, ...o });
const code = (slot: string, name: string, c: string, o: Record<string, unknown> = {}) => create({ slot, name: `zz-test ${name}`, type: "code", device: "all", code: c, ...o });

const settingBefore = await prisma.setting.findUnique({ where: { key: "ads.enabled" } });
const workId = (await retry(() => prisma.work.findFirst({ where: { publish: "PUBLISHED", coverKey: { not: null } }, select: { publicId: true }, orderBy: { publicId: "asc" } })))!.publicId;
const short = await retry(() => prisma.work.findFirst({ where: { publish: "PUBLISHED", pageCount: { gte: 3, lte: 10 }, chapters: { some: { status: "READY" } } }, select: { publicId: true, pageCount: true } }));
await cleanup();
try {
  /* ───────────── 1. the admin actions ───────────── */
  console.log("\n— what an admin can do");
  const bad = async (raw: Record<string, unknown>, re: RegExp, name: string) => {
    const r = await saveAd(prisma, ME, null, raw);
    ok(!r.ok && re.test(r.message), name, JSON.stringify(r));
  };
  await bad({ slot: "home-top", name: "zz-test x", type: "banner", device: "all", imageUrl: "http://insecure.example/a.png", linkUrl: "https://a.example/" }, /https/, "an insecure image address is refused");
  await bad({ slot: "home-top", name: "zz-test x", type: "banner", device: "all", imageUrl: IMG, linkUrl: "javascript:alert(1)" }, /link address/, "a javascript: link is refused");
  await bad({ slot: "home-top", name: "zz-test x", type: "code", device: "all", code: "  " }, /Paste the ad code/, "empty ad code is refused");
  await bad({ slot: "nope", name: "zz-test x", type: "code", device: "all", code: "<b>x</b>" }, /does not exist/, "an unknown slot is refused");
  ok((await prisma.ad.count({ where: { name: { startsWith: "zz-test" } } })) === 0, "refused ads leave nothing behind");

  const a = await saveAd(prisma, ME, null, { slot: "list-footer", name: "zz-test admin flow", type: "code", device: "all", code: "<b>v1</b>", active: "on", priority: "5" });
  ok(a.ok, "an ad is created");
  const adId = a.ok ? a.id! : "";
  const u = await saveAd(prisma, ME, adId, { name: "zz-test admin flow", type: "code", device: "all", code: "<b>v2</b>", active: "on", priority: "7", slot: "home-top" });
  const after = await prisma.ad.findUnique({ where: { id: adId } });
  ok(u.ok && after?.code === "<b>v2</b>" && after.priority === 7, "an ad is updated");
  ok(after?.slot === "list-footer", "an ad cannot be moved to another place by editing (the slot in the form is ignored)");
  const noop = await saveAd(prisma, ME, adId, { name: "zz-test admin flow", type: "code", device: "all", code: "<b>v2</b>", active: "on", priority: "7" });
  ok(noop.ok && /Nothing changed/.test(noop.message), "saving without a change is harmless and says so", JSON.stringify(noop));
  ok((await setAdActive(prisma, ME, adId, false)).ok && (await prisma.ad.findUnique({ where: { id: adId } }))?.active === false, "an ad can be paused");
  // ad code is the owner's: an admin may manage banners, pause, copy and remove, but not write or change code
  const asAdmin = (id: string | null, raw: Record<string, unknown>) => saveAd(prisma, ME, id, raw, false);
  const refusedCode = await asAdmin(null, { slot: "list-footer", name: "zz-test admin code", type: "code", device: "all", code: "<b>x</b>" });
  ok(!refusedCode.ok && refusedCode.message === CODE_OWNER_ONLY, "an admin who is not the owner cannot add ad code");
  const refusedEdit = await asAdmin(adId, { name: "zz-test admin flow", type: "code", device: "all", code: "<b>changed</b>", active: "on" });
  ok(!refusedEdit.ok && (await prisma.ad.findUnique({ where: { id: adId } }))?.code === "<b>v2</b>", "...nor change existing ad code");
  const refusedSwap = await asAdmin(adId, { name: "zz-test admin flow", type: "banner", device: "all", imageUrl: IMG, linkUrl: "https://example.com/", active: "on" });
  ok(!refusedSwap.ok, "...nor replace a code ad with a banner (that removes code the owner wrote)");
  const bannerByAdmin = await asAdmin(null, { slot: "list-footer", name: "zz-test admin banner", type: "banner", device: "all", imageUrl: IMG, linkUrl: "https://example.com/", active: "on" });
  ok(bannerByAdmin.ok, "...but can add a banner");
  ok((await setAdActive(prisma, ME, adId, true)).ok && (await setAdActive(prisma, ME, adId, false)).ok, "...and can still pause and resume ad code");
  const dup = await duplicateAd(prisma, ME, adId);
  const copy = dup.ok ? await prisma.ad.findUnique({ where: { id: dup.id! } }) : null;
  ok(!!copy && copy.name === "zz-test admin flow (copy)" && copy.active === false && copy.code === "<b>v2</b>", "a copy is made, paused");
  ok((await deleteAd(prisma, ME, adId)).ok && !(await prisma.ad.findUnique({ where: { id: adId } })), "an ad can be removed");
  ok((await deleteAd(prisma, ME, adId)).ok, "removing it twice is harmless");
  const audits = await prisma.auditLog.findMany({ where: { actorEmail: ME.email }, orderBy: { createdAt: "asc" } });
  ok(["ad.create", "ad.update", "ad.pause", "ad.delete"].every((k) => audits.some((x) => x.action === k)), "every change is in the audit log", audits.map((x) => x.action).join(","));
  const upd = audits.find((x) => x.action === "ad.update");
  ok(JSON.stringify(upd?.diff).includes("codeChanged") && !JSON.stringify(upd?.diff).includes("v2"), "the log says the code changed, without copying the code");

  // the per-slot limit
  for (let i = 0; i < MAX_ADS_PER_SLOT; i++) await prisma.ad.create({ data: { slot: "search-top", name: `zz-test bulk ${i}`, type: "banner", device: "all", imageUrl: IMG, linkUrl: "https://example.com/", active: false } });
  const over = await saveAd(prisma, ME, null, { slot: "search-top", name: "zz-test one too many", type: "code", device: "all", code: "<b>x</b>" });
  ok(!over.ok && /at most/.test(over.message), `a slot holds at most ${MAX_ADS_PER_SLOT} ads`);
  await prisma.ad.deleteMany({ where: { slot: "search-top", name: { startsWith: "zz-test" } } });

  /* ───────────── 2. what the public site serves ───────────── */
  console.log("\n— what visitors get");
  const A = await banner("home-top", "all-device banner", { priority: "50" });
  const M = await banner("home-top", "phone banner", { device: "mobile", priority: "0", width: 320, height: 100 });
  const paused = await banner("home-mid", "paused", { active: "" });
  const future = await banner("home-mid", "future", { startsAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16) });
  const ended = await prisma.ad.create({ data: { slot: "home-mid", name: "zz-test ended", type: "banner", device: "all", imageUrl: IMG, linkUrl: "https://example.com/", endsAt: new Date(Date.now() - 3_600_000), active: true } });
  const W1 = await banner("home-footer", "weight 1", { weight: "1" });
  const W3 = await banner("home-footer", "weight 3", { weight: "3" });
  const LT = await banner("list-top", "list top");
  const GRID = await banner("list-in-grid", "in grid");
  const RE = await banner("reader-end", "reader end");
  const POP = await code("global-popunder", "pop-under", "<script>window.__pop=(window.__pop||0)+1</script>");
  const CODE = await code("work-mid", "inline code", '<div id="zz-inline">inline ad</div><script src="data:text/javascript,window.__lib=1"></script><script>window.__adran=(window.__adran||0)+1;window.__order=window.__lib===1?"ok":"bad"</script>', { width: 300, height: 250 });
  const WIDE = await code("list-footer", "wide code", '<div id="zz-wide" style="width:728px;height:90px;background:#fde">wide</div>', { width: 728, height: 90, priority: "90" });
  const FRAME = await code("work-footer", "framed code", '<div id="zz-frame">framed ad</div><script>try{parent.document.title="pwned"}catch(e){document.body.setAttribute("data-blocked","1")}</script>', { isolation: "frame", width: 300, height: 250 });

  await settle();
  let r = await page("/");
  ok(r.status === 200 && has(r.html, A) && !has(r.html, M), "a computer gets the 'any device' ad on the home page (and not the phone one)");
  ok(r.html.includes(`href="/go/ad/${A.id}"`) && /rel="sponsored nofollow noopener"/.test(r.html) && /target="_blank"/.test(r.html), "a banner links through the counting redirect, marked sponsored and nofollow, in a new tab");
  ok(/aria-label="Advertisement"/.test(r.html), "the box is labelled for screen readers");
  r = await page("/", { ua: PHONE });
  ok(has(r.html, M) && !has(r.html, A), "a phone gets the phone ad, which beats the 'any device' ad even at a lower priority");
  r = await page("/", { ua: BOT });
  ok(r.status === 200 && !has(r.html, A) && !has(r.html, M) && !r.html.includes("data-ad-id"), "a crawler is shown no ads at all");
  r = await page("/", { cookie: "lm_session=abc" });
  ok(!r.html.includes("data-ad-id"), "a signed-in admin is shown no ads (no accidental clicks on your own ads)");
  r = await page("/", { cookie: "lm_nocount=1" });
  ok(!r.html.includes("data-ad-id"), "a test run is shown no ads");
  r = await page("/");
  ok(!has(r.html, paused) && !has(r.html, future) && !r.html.includes(`data-ad-id="${ended.id}"`) && !r.html.includes('data-ad-slot="home-mid"'), "paused, not-yet-started and finished ads are not shown, and their slot renders nothing");
  ok(!r.html.includes('data-ad-slot="search-top"'), "a slot with no ad renders nothing at all");

  const tally: Record<string, number> = {};
  for (let i = 0; i < 100; i += 10) await Promise.all(Array.from({ length: 10 }, async () => { const p = await page("/"); const w = has(p.html, W1) ? "w1" : has(p.html, W3) ? "w3" : "none"; tally[w] = (tally[w] ?? 0) + 1; }));
  ok((tally.w3 ?? 0) >= 62 && (tally.w3 ?? 0) <= 88 && (tally.w1 ?? 0) >= 12 && !tally.none, "equal-priority ads share a slot in proportion to their weight (1:3 over 100 views)", JSON.stringify(tally));

  r = await page("/browse");
  ok(has(r.html, LT) && has(r.html, GRID), "the list pages show the top and the in-grid ads");
  const gridAt = r.html.indexOf(`data-ad-id="${GRID.id}"`);
  const cardsBefore = (r.html.slice(0, gridAt).match(/<article/g) ?? []).length;
  ok(cardsBefore >= 10 && cardsBefore <= 12, "the in-grid ad comes after the 10th or 12th work, never mid-row", `${cardsBefore} works before it`);
  ok((r.html.match(new RegExp(`data-ad-id="${GRID.id}"`, "g")) ?? []).length === 2, "it is in the page twice (one per column layout), and only one copy is ever visible");

  // the counters
  console.log("\n— counting");
  const today = new Date().toISOString().slice(0, 10);
  const stat = async (id: string) => (await retry(() => prisma.adStat.findFirst({ where: { adId: id, day: new Date(`${today}T00:00:00Z`) } }))) ?? { impressions: 0, clicks: 0 };
  const hit = (body: unknown, o: { ua?: string; headers?: Record<string, string> } = {}) =>
    fetch(`${BASE}/api/ads/i`, { method: "POST", headers: { "content-type": "application/json", "user-agent": o.ua ?? DESKTOP, "x-forwarded-for": "203.0.113.50", ...o.headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  ok((await hit({ ad: LT.id })).status === 204 && (await stat(LT.id)).impressions === 1, "a shown ad adds one to today's count");
  await hit({ ad: LT.id });
  ok((await stat(LT.id)).impressions === 2, "and again");
  ok((await hit({ ad: "nonsense" })).status === 400 && (await hit("null")).status === 400 && (await hit("{")).status === 400, "a bad id or body is a 400");
  const ghost = "cabcdefghijklmnopqrstuvwx";
  await hit({ ad: ghost });
  ok((await prisma.adStat.count({ where: { adId: ghost } })) === 0, "an id that is not a real ad creates nothing");
  const before = (await stat(LT.id)).impressions;
  ok((await hit({ ad: LT.id }, { headers: { origin: "https://evil.example" } })).status === 403, "another website cannot count for us (403)");
  await hit({ ad: LT.id }, { ua: BOT });
  await hit({ ad: LT.id }, { headers: { cookie: "lm_session=abc" } });
  await hit({ ad: LT.id }, { headers: { cookie: "lm_nocount=1" } });
  ok((await stat(LT.id)).impressions === before, "robots, signed-in admins and test runs are not counted");

  console.log("\n— the click redirect");
  const go = (id: string, ua = DESKTOP) => fetch(`${BASE}/go/ad/${id}`, { redirect: "manual", headers: { "user-agent": ua } });
  let g = await go(LT.id);
  ok(g.status === 302 && g.headers.get("location") === "https://example.com/offer?x=1", "a click goes to the advertiser's address", `${g.status} ${g.headers.get("location")}`);
  ok(g.headers.get("x-robots-tag")?.includes("noindex") === true, "the redirect is never indexed", String(g.headers.get("x-robots-tag")));
  ok(/no-store/.test(g.headers.get("cache-control") ?? ""), "the redirect is never cached", String(g.headers.get("cache-control")));
  ok((await stat(LT.id)).clicks === 1, "and is counted");
  await go(LT.id, BOT);
  ok((await stat(LT.id)).clicks === 1, "a robot is redirected but not counted");
  g = await go(paused.id);
  ok(g.status === 302 && new URL(g.headers.get("location")!).pathname === "/", "a paused ad sends the visitor home");
  g = await go("nonsense");
  ok(g.status === 302 && new URL(g.headers.get("location")!).pathname === "/", "an unknown ad sends the visitor home");
  const evil = await prisma.ad.create({ data: { slot: "list-footer", name: "zz-test evil link", type: "banner", device: "all", imageUrl: IMG, linkUrl: "javascript:alert(1)", active: true } });
  g = await go(evil.id);
  ok(g.status === 302 && new URL(g.headers.get("location")!).pathname === "/", "a bad link that got into the database anyway is never followed");
  ok((await fetch(`${BASE}/robots.txt`).then((x) => x.text())).includes("Disallow: /go/"), "robots.txt keeps crawlers off /go/");

  /* ───────────── 3. a real browser ───────────── */
  console.log("\n— a visitor's browser");
  const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled", `--user-agent=${DESKTOP}`] });
  const mk = async (o: { age?: boolean; dnt?: boolean; w?: number; phone?: boolean } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: o.w ?? 1280, height: 900 }, extraHTTPHeaders: o.dnt ? { dnt: "1" } : {}, ...(o.phone ? { userAgent: PHONE, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } } : {}) });
    if (o.age !== false) await ctx.addCookies([{ name: AGE_COOKIE, value: "1", url: BASE }]);
    if (o.dnt) await ctx.addInitScript({ content: "Object.defineProperty(Navigator.prototype,'doNotTrack',{get:()=>'1',configurable:true})" });
    return ctx;
  };

  // an adult visitor on the list page
  let ctx = await mk();
  let p = await ctx.newPage();
  const t0 = (await stat(LT.id)).impressions;
  await p.goto(`${BASE}/browse`, { waitUntil: "commit" });
  await p.waitForTimeout(450);
  ok((await stat(LT.id)).impressions === t0, "nothing is counted before the ad has been in view for a second");
  await p.waitForLoadState("networkidle");
  const visible = await p.locator(`[data-ad-id="${GRID.id}"]`).evaluateAll((els) => els.map((e) => (e as HTMLElement).offsetParent !== null));
  ok(visible.filter(Boolean).length === 1, "exactly one copy of the in-grid ad is visible at 1280 px", JSON.stringify(visible));
  const order = await p.evaluate(worksBefore, GRID.id);
  ok(order === 12, "at 1280 px the visible ad sits right after the 12th work", String(order));
  await p.locator(`[data-ad-id="${LT.id}"]`).scrollIntoViewIfNeeded();
  await p.waitForTimeout(2500);
  ok((await stat(LT.id)).impressions === t0 + 1, "once seen for a second, exactly one impression is counted");
  await p.waitForTimeout(1500);
  ok((await stat(LT.id)).impressions === t0 + 1, "staying on the page does not count it again");
  await ctx.close();

  // five columns (1024-1279 px): the other copy is the visible one, after the 10th work
  ctx = await mk({ w: 1100 });
  p = await ctx.newPage();
  await p.goto(`${BASE}/browse`, { waitUntil: "networkidle" });
  const five = await p.evaluate(worksBefore, GRID.id);
  ok(five === 10, "at 1100 px (5 columns) the visible ad sits after the 10th work, so no row has a hole", String(five));
  await ctx.close();

  // a phone
  ctx = await mk({ phone: true });
  p = await ctx.newPage();
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  ok((await p.locator(`[data-ad-id="${M.id}"]`).count()) === 1 && (await p.locator(`[data-ad-id="${A.id}"]`).count()) === 0, "a phone browser gets the phone ad");
  await ctx.close();

  // the age gate
  ctx = await mk({ age: false });
  p = await ctx.newPage();
  await p.goto(`${BASE}/g/${workId}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  ok((await p.locator("#site-content").getAttribute("data-gated")) === "true", "the age gate is showing");
  ok(((await p.evaluate(() => (window as unknown as { __adran?: number }).__adran)) ?? 0) === 0 && (await p.locator("#zz-inline").count()) === 0, "an ad network's code does not run while the age gate is showing");
  await p.getByRole("button", { name: "I am 18 or older, enter" }).click();
  await p.waitForFunction(() => document.getElementById("site-content")?.getAttribute("data-gated") === "false", null, { timeout: 30_000 });
  await p.waitForFunction(() => (window as unknown as { __adran?: number }).__adran !== undefined, null, { timeout: 15_000 }).catch(() => {});
  await p.waitForTimeout(800);
  const ran = await p.evaluate(() => (window as unknown as { __adran?: number }).__adran);
  ok(ran === 1 && (await p.locator("#zz-inline").count()) === 1, "after the visitor confirms they are adults, the code runs, once", String(ran));
  ok((await p.evaluate(() => (window as unknown as { __pop?: number }).__pop)) === 1, "the pop-under script is loaded once the gate is passed");
  ok((await p.evaluate(() => (window as unknown as { __order?: string }).__order)) === "ok", "scripts in ad code run in order (a loader finishes before the code that uses it)");
  const box = await p.locator(`[data-ad-id="${CODE.id}"] > div`).last().evaluate((e) => (e as HTMLElement).style.height);
  ok(box === "250px", "the box keeps the ad's size from the start, so nothing around it moves", box);
  await ctx.close();

  // a wide fixed-size ad on a phone is scaled to fit, not cut off; on a computer it is shown at its real size
  ctx = await mk({ phone: true });
  p = await ctx.newPage();
  await p.goto(`${BASE}/browse`, { waitUntil: "networkidle" });
  await p.locator(`[data-ad-id="${WIDE.id}"]`).scrollIntoViewIfNeeded();
  await p.waitForTimeout(1500);
  const phoneBox = await p.evaluate((id) => {
    const box = document.querySelector(`[data-ad-id="${id}"]`) as HTMLElement;
    const inner = box.querySelector("div[style*='transform']") as HTMLElement | null;
    const ad = box.querySelector("#zz-wide") as HTMLElement | null;
    return { boxW: Math.round(box.getBoundingClientRect().width), adW: ad ? Math.round(ad.getBoundingClientRect().width) : -1, scaled: !!inner, viewport: window.innerWidth };
  }, WIDE.id);
  ok(phoneBox.scaled && phoneBox.adW > 0 && phoneBox.adW <= phoneBox.boxW + 1 && phoneBox.boxW <= phoneBox.viewport, "a 728-pixel ad on a 390-pixel phone is scaled down to fit", JSON.stringify(phoneBox));
  await ctx.close();
  ctx = await mk();
  p = await ctx.newPage();
  await p.goto(`${BASE}/browse`, { waitUntil: "networkidle" });
  await p.locator(`[data-ad-id="${WIDE.id}"]`).scrollIntoViewIfNeeded();
  await p.waitForTimeout(1500);
  const deskAd = await p.evaluate(() => Math.round((document.querySelector("#zz-wide") as HTMLElement).getBoundingClientRect().width));
  ok(deskAd === 728 && (await p.locator("div[style*='transform: scale']").count()) === 0, "on a computer the same ad is shown at its real size, unscaled", String(deskAd));
  await ctx.close();

  // an isolated frame
  ctx = await mk();
  p = await ctx.newPage();
  await p.goto(`${BASE}/g/${workId}`, { waitUntil: "networkidle" });
  await p.locator(`[data-ad-id="${FRAME.id}"]`).scrollIntoViewIfNeeded();
  await p.waitForTimeout(2000);
  const fr = p.frames().find((f) => f !== p.mainFrame() && f.url() === "about:srcdoc");
  const sandbox = await p.locator(`[data-ad-id="${FRAME.id}"] iframe`).getAttribute("sandbox");
  ok(!!fr && !!sandbox && !sandbox.includes("allow-same-origin"), "an isolated ad runs in a sandboxed frame without access to the site", `sandbox=${sandbox}`);
  ok((await fr?.locator("body").getAttribute("data-blocked")) === "1" && (await p.title()) !== "pwned", "and the code inside cannot touch the page around it");
  await ctx.close();

  // Do Not Track: ads still show, but nothing is counted
  ctx = await mk({ dnt: true });
  p = await ctx.newPage();
  await p.goto(`${BASE}/browse`, { waitUntil: "networkidle" });
  const d0 = (await stat(LT.id)).impressions;
  await p.locator(`[data-ad-id="${LT.id}"]`).scrollIntoViewIfNeeded();
  await p.waitForTimeout(2600);
  ok((await p.locator(`[data-ad-id="${LT.id}"]`).count()) === 1 && (await stat(LT.id)).impressions === d0, "with Do Not Track the ad shows but its impression is not counted");
  await ctx.close();

  // a banner click in a browser
  ctx = await mk();
  p = await ctx.newPage();
  await p.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>advertiser</title>advertiser" }));
  await p.goto(`${BASE}/browse`, { waitUntil: "networkidle" });
  const c0 = (await stat(LT.id)).clicks;
  const [popup] = await Promise.all([ctx.waitForEvent("page"), p.locator(`a[href="/go/ad/${LT.id}"]`).click()]);
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  ok(popup.url().startsWith("https://example.com/offer") && (await stat(LT.id)).clicks === c0 + 1, "clicking a banner opens the advertiser in a new tab and counts one click", popup.url());
  await ctx.close();

  // accessibility, with ads on the page
  ctx = await mk();
  for (const path of ["/", "/browse", `/g/${workId}`]) {
    p = await ctx.newPage();
    await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    const res = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = res.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`);
    ok(serious.length === 0 && (await p.locator("[data-ad-id]").count()) > 0, `${path}: no serious accessibility problems with ads showing`, serious.join(" | "));
    await p.close();
  }
  await ctx.close();

  // the reader's end-of-chapter card
  if (short) {
    ctx = await mk();
    p = await ctx.newPage();
    await p.goto(`${BASE}/read/${short.publicId}/1`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    let end = false;
    for (const key of ["ArrowRight", "ArrowLeft"]) {
      for (let i = 0; i < short.pageCount + 3 && !end; i++) {
        await p.keyboard.press(key);
        await p.waitForTimeout(250);
        end = (await p.getByText(/End of chapter|The end|You reached the last page/).count()) > 0;
      }
      if (end) break;
    }
    ok(end && (await p.locator(`[data-ad-id="${RE.id}"]`).count()) === 1, "the ad appears on the reader's end-of-chapter card, and nowhere between pages", `reached end: ${end}`);
    await ctx.close();
  } else console.log("skip  no short work to reach the end card");
  await browser.close();

  if (process.env.PREVIEW_BASE) {
    const pv = await fetch(`${process.env.PREVIEW_BASE}/`, { headers: { "user-agent": DESKTOP } }).then((x) => x.text());
    ok(!pv.includes("data-ad-id") && pv.length > 1000, "a preview deployment shows no ads (it shares the database but is not the registered site)");
  }

  /* ───────────── 4. a change takes effect (after the one-minute cache) ───────────── */

  console.log(`\n— the master switch and pausing (a server with ADS_CACHE_SECONDS=1 picks the change up within seconds)`);
  await setAdActive(prisma, ME, W3.id, false);
  await setAdActive(prisma, ME, W1.id, false);
  await setAdsEnabled(prisma, ME, false);
  await settle();
  r = await page("/");
  ok(!r.html.includes("data-ad-id"), "with ads switched off, no ad is shown anywhere");
  await setAdsEnabled(prisma, ME, true);
  await settle();
  r = await page("/");
  ok(has(r.html, A) && !r.html.includes('data-ad-slot="home-footer"'), "switched back on, ads return, and the two paused ones stay hidden (their slot is empty)");
} finally {
  await cleanup();
  if (settingBefore) await prisma.setting.upsert({ where: { key: "ads.enabled" }, create: { key: "ads.enabled", value: settingBefore.value as boolean }, update: { value: settingBefore.value as boolean } });
  else await prisma.setting.deleteMany({ where: { key: "ads.enabled" } });
  const left = (await prisma.ad.count({ where: { name: { startsWith: "zz-test" } } })) + (await prisma.auditLog.count({ where: { actorEmail: ME.email } }));
  ok(left === 0, "the test data is gone again");
  await prisma.$disconnect();
}
console.log(fails ? `\n${fails} FAILED` : "\nall ad checks passed");
process.exit(fails ? 1 : 0);
