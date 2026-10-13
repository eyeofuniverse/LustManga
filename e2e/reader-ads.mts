// Ads between pages in the reader, end to end in a real browser: where they go (every 15 pages, every 30 in a long work), that
// they are for looking at only (a tap or a key never opens one), that reading is not disturbed (page numbers, back, Continue,
// no repeats), that an ad slot which stays empty is left out, and that a tab with empty slots is left alone afterwards.
//   ADS_CACHE_SECONDS=1 NEXT_PUBLIC_SITE_URL=http://localhost:3200 npx next start -p 3200
//   BASE_URL=http://localhost:3200 npx tsx --env-file=.env e2e/reader-ads.mts
// Test ads are named "zz-test" and removed at the end. They sit in the real slot (priority 100) for a few minutes, so a visitor
// to a reader could see one in that time.
import { chromium, type BrowserContext, type Page } from "playwright";
import { prisma, db } from "../src/lib/db";
import { AGE_COOKIE } from "../src/lib/prefs";
import { deleteAd, saveAd } from "../src/lib/admin/ads-core";
import { readerAdPositions } from "../src/lib/ads/reader";

const BASE = (process.env.BASE_URL ?? "http://localhost:3200").replace(/\/$/, "");
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ME = { id: "zz-test-admin", email: "zz-test@test.invalid" };
const retry = <T,>(fn: () => Promise<T>) => db(fn, 8);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (c: boolean, name: string, extra = "") => {
  if (!c) fails++;
  console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && extra ? `  [${extra}]` : ""}`);
};

/** a chapter of a work with the given size, that the reader really opens */
async function pick(label: string, where: { chapterPages: [number, number]; workPages: [number, number] }) {
  const rows = await retry(() =>
    prisma.chapter.findMany({
      where: { status: "READY", pageCount: { gte: where.chapterPages[0], lte: where.chapterPages[1] }, work: { publish: "PUBLISHED", pageCount: { gte: where.workPages[0], lte: where.workPages[1] } } },
      select: { number: true, pageCount: true, work: { select: { publicId: true, pageCount: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  );
  for (const r of rows) {
    const res = await fetch(`${BASE}/read/${r.work.publicId}/${r.number}`, { headers: { "user-agent": DESKTOP }, redirect: "manual" });
    if (res.status === 200) return { id: r.work.publicId, chapter: r.number, pages: r.pageCount, workPages: r.work.pageCount, url: `${BASE}/read/${r.work.publicId}/${r.number}` };
  }
  throw new Error(`no readable chapter for: ${label}`);
}

const OK_CODE = '<a id="zz-link" href="https://example.com/zz-click" target="_blank" rel="noopener" style="display:block;width:300px;height:250px;background:#a0c;color:#fff;font:20px sans-serif;text-align:center;line-height:250px">zz reader ad</a>';
const NEVER = '<script async src="data:text/javascript,void 0"></script> <ins data-zoneid="1"></ins>';
const mkAd = async (name: string, code: string, priority: number) => {
  const r = await saveAd(prisma, ME, null, { slot: "reader-mid", name: `zz-test ${name}`, type: "code", device: "all", code, width: 300, height: 250, priority: String(priority), active: "on" });
  if (!r.ok) throw new Error(r.message);
  return r.id!;
};
// the site keeps its ad choices for a minute (a console save drops them at once; these tests write to the database), so on the real
// site a change is waited out; a local server started with ADS_CACHE_SECONDS=1 only needs a moment
const CACHE_WAIT_MS = BASE.includes("localhost") ? 1800 : 65_000;
const settle = async (url: string) => {
  await sleep(CACHE_WAIT_MS);
  await fetch(url, { headers: { "user-agent": DESKTOP } });
  await sleep(CACHE_WAIT_MS === 1800 ? 1800 : 4000);
};
async function cleanup() {
  await retry(() => prisma.ad.deleteMany({ where: { name: { startsWith: "zz-test" } } }));
  await retry(() => prisma.auditLog.deleteMany({ where: { actorEmail: ME.email } }));
}

const browser = await chromium.launch();
const errors: string[] = [];
async function open(url: string, o: { phone?: boolean; wide?: boolean; mode?: "book" | "scroll"; cookies?: { name: string; value: string }[] } = {}) {
  const ctx = await browser.newContext({
    userAgent: o.phone ? PHONE : DESKTOP,
    viewport: o.phone ? { width: 390, height: 844 } : o.wide ? { width: 1440, height: 900 } : { width: 800, height: 900 }, // 800 wide: one page at a time
    isMobile: !!o.phone,
    hasTouch: !!o.phone,
  });
  await ctx.addCookies([{ name: AGE_COOKIE, value: "1", url: BASE }, ...(o.cookies ?? []).map((c) => ({ ...c, url: BASE }))]);
  if (o.mode) await ctx.addInitScript((m) => localStorage.setItem("lm:reader", JSON.stringify({ mode: m, rtl: false, spread: "auto", width: 860, dim: 0, bg: "black", coverAlone: true, autoSpeed: 2 })), o.mode);
  const popups: string[] = [];
  const page = await ctx.newPage();
  ctx.on("page", (p) => popups.push(p.url())); // after the reader's own page: only what the page opens counts
  page.on("pageerror", (e) => errors.push(`${url}: ${e.message.slice(0, 120)}`));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[aria-roledescription="carousel"], #pg-1', { timeout: 60000 });
  await sleep(1500); // hydrated: the keys and taps work
  return { ctx, page, popups };
}
const live = (p: Page) => p.locator("p[aria-live=polite]").innerText();
const press = async (p: Page, key: string, n = 1) => {
  for (let i = 0; i < n; i++) {
    await p.keyboard.press(key);
    await sleep(420);
  }
};
// the book's slide that is showing an ad (not the ad's own box inside it)
const onAdSlide = (p: Page) => p.locator('[aria-roledescription="slide"][aria-label="Advertisement"]:not([aria-hidden="true"])').count();
const settleBook = async (p: Page, pred: () => Promise<boolean>, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await pred().catch(() => false)) return true;
    await sleep(250);
  }
  return false;
};

await cleanup();
try {
  const small = await pick("short work, 40+ page chapter", { chapterPages: [40, 80], workPages: [40, 99] });
  const big = await pick("long work, 65+ page chapter", { chapterPages: [65, 400], workPages: [100, 100000] });
  const tiny = await pick("a chapter shorter than one interval", { chapterPages: [6, 14], workPages: [1, 99] });
  console.log(`(small: #${small.id} ch${small.chapter}, ${small.pages} pages in a work of ${small.workPages}; big: #${big.id} ch${big.chapter}, ${big.pages} pages in a work of ${big.workPages}; tiny: ${tiny.pages} pages)`);

  /* ───────────── no ad: nothing changes ───────────── */
  console.log("\n— with no ad to show");
  await settle(small.url);
  let r = await open(small.url, { phone: true });
  await press(r.page, "ArrowDown", 15);
  ok(/Page 16 of/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0, "no ad configured: page 16 follows page 15 directly");
  await r.ctx.close();

  /* ───────────── a short work: every 15 pages, in the book ───────────── */
  console.log("\n— a short work, book mode on a phone");
  const AD = await mkAd("reader ad", OK_CODE, 100);
  await settle(small.url);
  r = await open(small.url, { phone: true });
  await press(r.page, "ArrowDown", 14);
  ok(/Page 15 of/.test(await live(r.page)), "page 15 is reached by 14 turns");
  await press(r.page, "ArrowDown");
  ok(await settleBook(r.page, async () => (await onAdSlide(r.page)) === 1 && (await r.page.locator("#zz-link").isVisible())), "the next turn shows the ad (after page 15)");
  ok(/Advertisement/.test(await live(r.page)) && !(await live(r.page)).includes("Page 16"), "the page line does not move on: it is an ad, not a page");
  ok(await r.page.getByRole("button", { name: "Continue reading" }).isVisible(), "there is a Continue button");
  ok((await r.page.evaluate(() => document.querySelectorAll("script[src*=pemsrv], script[src*=popunder]").length)) === 0, "the reader loads no pop-under script");
  // an accidental tap on the ad
  const box = (await r.page.locator("#zz-link").boundingBox())!;
  const url0 = r.page.url();
  await r.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(1500);
  ok(r.popups.length === 0 && r.page.url() === url0, "a tap in the middle of the ad opens nothing", JSON.stringify(r.popups));
  ok((await onAdSlide(r.page)) === 1, "...and the ad is still there (the middle of the screen only brings the bars back)");
  const adState = await r.page.evaluate(() => {
    const a = document.getElementById("zz-link")!;
    return { inert: !!a.closest("[inert]"), pe: getComputedStyle(a).pointerEvents };
  });
  ok(adState.inert && adState.pe === "none", "the ad is inert and takes no pointer events", JSON.stringify(adState));
  await r.page.keyboard.press("Tab");
  await r.page.keyboard.press("Tab");
  await r.page.keyboard.press("Tab");
  ok((await r.page.evaluate(() => document.activeElement?.id)) !== "zz-link", "the keyboard cannot reach the ad");
  // a tap meant to turn the page, that lands on the ad (the right edge, over the ad): it turns the page and opens nothing
  await r.page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
  ok(await settleBook(r.page, async () => /Page 16 of/.test(await live(r.page))), "a tap at the right edge, over the ad, turns the page as it would anywhere");
  await sleep(1200);
  ok(r.popups.length === 0, "...and opens no ad", JSON.stringify(r.popups));
  // back never lands on the ad, forward over it once seen does not show it again
  await press(r.page, "ArrowUp");
  ok(/Page 15 of/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0, "going back from 16 lands on page 15, not the ad");
  await press(r.page, "ArrowDown");
  ok(/Page 16 of/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0, "going forward again passes the ad already seen");
  // the second one, after page 30
  await press(r.page, "ArrowDown", 14);
  ok(/Page 30 of/.test(await live(r.page)), "page 30 is reached");
  await press(r.page, "ArrowDown");
  ok(await settleBook(r.page, async () => (await onAdSlide(r.page)) === 1), "the second ad comes after page 30");
  await r.page.getByRole("button", { name: "Continue reading" }).click();
  ok(await settleBook(r.page, async () => /Page 31 of/.test(await live(r.page))), "Continue goes on to page 31, and the ad is gone");
  ok((await onAdSlide(r.page)) === 0, "(no ad slide is left showing)");
  // the last pages carry no ad, and the end of the chapter is still the end card
  await r.page.keyboard.press("End");
  await sleep(500);
  ok(/Page \d+ of/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0, "jumping to the end shows no ad on the way");
  await r.ctx.close();

  /* ───────────── a chapter shorter than one interval ───────────── */
  console.log("\n— a chapter shorter than 15 pages");
  await settle(tiny.url);
  r = await open(tiny.url, { phone: true });
  await press(r.page, "ArrowDown", tiny.pages - 1);
  ok((await onAdSlide(r.page)) === 0, "has no ad between its pages");
  await r.ctx.close();

  /* ───────────── a long work: every 30 pages ───────────── */
  console.log("\n— a long work: every 30");
  await settle(big.url);
  r = await open(big.url, { phone: true });
  await press(r.page, "ArrowDown", 15);
  ok(/Page 16 of/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0, "no ad after page 15");
  await press(r.page, "ArrowDown", 14);
  ok(/Page 30 of/.test(await live(r.page)), "page 30 is reached");
  await press(r.page, "ArrowDown");
  ok(await settleBook(r.page, async () => (await onAdSlide(r.page)) === 1), "the ad comes after page 30");
  await r.ctx.close();

  /* ───────────── two pages at a time ───────────── */
  console.log("\n— a wide screen (two pages at a time)");
  r = await open(small.url, { wide: true });
  let sawAd = false;
  let before = "";
  for (let i = 0; i < 12 && !sawAd; i++) {
    before = await live(r.page);
    await press(r.page, "ArrowDown");
    sawAd = await settleBook(r.page, async () => (await onAdSlide(r.page)) === 1, 900);
  }
  ok(sawAd, "an ad comes up in spread mode too");
  ok(/14–15/.test(before), "...right after the pair that holds page 15", before);
  await press(r.page, "ArrowDown");
  ok(/16–17/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0, "and the next turn is the next pair", await live(r.page));
  await r.ctx.close();

  /* ───────────── scroll mode ───────────── */
  console.log("\n— scroll mode");
  r = await open(small.url, { phone: true, mode: "scroll" });
  const bands = await r.page.locator("[data-ad-after]").evaluateAll((els) => els.map((e) => ({ after: e.getAttribute("data-ad-after"), h: Math.round(e.getBoundingClientRect().height) })));
  const want = readerAdPositions(small.pages, 15).map(String);
  ok(want.length >= 2 && JSON.stringify(bands.map((b) => b.after)) === JSON.stringify(want) && bands.every((b) => b.h === 340), `bands after pages ${want.join(", ")}, each a fixed 340 px (nothing moves when the ad arrives)`, JSON.stringify(bands));
  await r.page.locator('[data-ad-after="15"]').scrollIntoViewIfNeeded();
  await sleep(1200);
  ok(await settleBook(r.page, async () => await r.page.locator('[data-ad-after="15"] #zz-link').isVisible()), "the ad is there when the reader gets to it");
  const sb = (await r.page.locator("#zz-link").first().boundingBox())!;
  await r.page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await sleep(1500);
  ok(r.popups.length === 0, "a tap on it opens nothing", JSON.stringify(r.popups));
  const pageBefore = await live(r.page);
  ok(/Page \d+ of/.test(pageBefore), "the page line still reads pages");
  ok((await r.page.locator("[data-n]").count()) === small.pages, "every page is still its own element: the ad bands are not pages");
  await r.ctx.close();

  /* ───────────── an ad slot that stays empty ───────────── */
  console.log("\n— an ad that never fills");
  await deleteAd(prisma, ME, AD);
  await mkAd("empty", NEVER, 100);
  await settle(small.url);
  r = await open(small.url, { phone: true });
  await press(r.page, "ArrowDown", 12);
  await sleep(7000); // longer than the 5 seconds an ad gets
  await press(r.page, "ArrowDown", 3);
  ok(/Page 16 of/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0, "an ad that did not fill is left out: page 16 follows page 15");
  const first = await r.page.evaluate(() => Number(sessionStorage.getItem("lm:reader-empty") ?? "0"));
  ok(first >= 1, "the empty slot was counted", String(first));
  // the second ad slot (after 30) also stays empty: after two, this tab is left alone
  await press(r.page, "ArrowDown", 12);
  await sleep(7000);
  await press(r.page, "ArrowDown", 3);
  ok(/Page 31 of/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0, "the second empty slot is left out too");
  const cookie = (await r.ctx.cookies()).find((c) => c.name === "lm_rq");
  ok(!!cookie && cookie.value === "1", "after two empty slots the tab is marked, so later pages make no room for ads", JSON.stringify(cookie));
  await r.ctx.close();
  // a chapter opened with that mark: no ad is even asked for
  r = await open(small.url, { phone: true, cookies: [{ name: "lm_rq", value: "1" }] });
  const asked = await r.page.evaluate(() => performance.getEntriesByType("resource").some((e) => /magsrv|data:text\/javascript/.test(e.name)));
  await press(r.page, "ArrowDown", 15);
  ok(/Page 16 of/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0 && !asked, "with the mark, page 16 follows 15 and nothing is requested");
  await r.ctx.close();

  /* ───────────── nothing shown to robots ───────────── */
  console.log("\n— who is not shown ads");
  await cleanup();
  await mkAd("reader ad 2", OK_CODE, 100);
  await settle(small.url);
  const bot = await (await fetch(small.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" } })).text();
  const human = await (await fetch(small.url, { headers: { "user-agent": DESKTOP } })).text();
  ok(!bot.includes("zz reader ad") && !bot.includes("reader-mid"), "a robot is given no ad data");
  ok(human.includes("reader-mid") || human.includes("zz-test"), "a visitor is given the ad data for the reader to use");
  r = await open(small.url, { phone: true, cookies: [{ name: "lm_nocount", value: "1" }] });
  await press(r.page, "ArrowDown", 15);
  ok(/Page 16 of/.test(await live(r.page)) && (await onAdSlide(r.page)) === 0, "a browser marked as not to be counted (a test run) is shown none");
  await r.ctx.close();

  ok(errors.length === 0, "no script errors on any reader page", errors.join(" | "));
} finally {
  await cleanup();
  const left = await retry(() => prisma.ad.count({ where: { name: { startsWith: "zz-test" } } }));
  ok(left === 0, "the test data is gone again");
  await browser.close();
  await prisma.$disconnect();
}
console.log(fails ? `\n${fails} FAILED` : "\nall reader ad checks passed");
process.exit(fails ? 1 : 0);
