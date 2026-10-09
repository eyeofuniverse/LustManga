// Behaviour tests against a running site: does it actually WORK, not just render.
//   BASE_URL=http://localhost:3200 npm run flows
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const CDN = process.env.NEXT_PUBLIC_IMG_CDN_HOST ?? "img-cdn.lustpages.com";
const SERIES = process.env.QA_SERIES ?? "74";
const TAG = process.env.QA_TAG ?? "big-breasts";
const ONESHOT = process.env.QA_ONESHOT ?? "113";

const png = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#553c8a" } }).png().toBuffer();
const results: [boolean, string][] = [];
const ok = (cond: boolean, name: string, extra = "") => {
  results.push([cond, name]);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? `  [${extra}]` : ""}`);
};

async function ctxFor(browser: Browser, opts: { width?: number; height?: number; age?: boolean; mobile?: boolean; storage?: Record<string, string>; /** let this browser's views and saves count (the one test that checks the counters) */ count?: boolean } = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 },
    isMobile: !!opts.mobile,
    hasTouch: !!opts.mobile,
  });
  // FLOWS_TIMEOUT (ms) lets the suite run against a slow database; the default suits a healthy one
  ctx.setDefaultNavigationTimeout(Number(process.env.FLOWS_TIMEOUT ?? 30_000));
  ctx.setDefaultTimeout(Number(process.env.FLOWS_TIMEOUT ?? 30_000));
  // test visits must not change the real popularity numbers; the cookie makes /api/view and /api/favorite ignore them
  if (!opts.count) await ctx.addCookies([{ name: "lm_nocount", value: "1", url: BASE }]);
  if (opts.age !== false) await ctx.addCookies([{ name: "lm_age", value: "1", url: BASE }]);
  await ctx.route(`https://${CDN}/**`, (r) => r.fulfill({ status: 200, contentType: "image/png", body: png, headers: { "access-control-allow-origin": "*" } }));
  if (opts.storage) await ctx.addInitScript((s) => Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)), opts.storage);
  return ctx;
}
const cookie = async (ctx: BrowserContext, name: string) => (await ctx.cookies()).find((c) => c.name === name)?.value;
const text = (p: Page, sel: string) => p.locator(sel).first().innerText({ timeout: 4000 }).catch(() => "");

const browser = await chromium.launch();

/* ───────── 1. age gate ───────── */
{
  const ctx = await ctxFor(browser, { age: false });
  const p = await ctx.newPage();
  await p.goto(BASE + "/");
  const dialog = p.getByRole("dialog");
  ok(await dialog.isVisible(), "age gate shows on a first visit");
  ok((await p.locator("#site-content").getAttribute("inert")) !== null, "page behind the gate is inert (not reachable by keyboard)");
  ok((await p.locator("#site-content").getAttribute("data-gated")) === "true", "page behind the gate is blurred (server-rendered, no flash)");
  await dialog.getByRole("button", { name: "Japanese" }).click();
  await dialog.getByRole("button", { name: /I am 18/ }).click();
  await p.waitForTimeout(800);
  ok(!(await dialog.isVisible().catch(() => false)), "gate closes after confirming");
  ok((await cookie(ctx, "lm_age")) === "1", "age cookie is set");
  const prefs = decodeURIComponent((await cookie(ctx, "lm_prefs")) ?? "");
  ok(prefs.includes('"en"') && prefs.includes('"ja"'), "language choices from the gate are saved", prefs);
  await p.reload();
  ok(!(await p.getByRole("dialog").isVisible().catch(() => false)), "gate does not come back on reload");
  ok((await p.locator("#site-content").getAttribute("inert")) === null, "page is interactive again");
  await ctx.close();
}

/* ───────── 2. search ───────── */
{
  const ctx = await ctxFor(browser);
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "load" });
  await p.waitForTimeout(1500); // hydration: the shortcut is attached by the client
  await p.keyboard.press("/");
  ok(await p.getByRole("combobox", { name: "Search" }).evaluate((el) => el === document.activeElement), "the / key focuses search");
  await p.getByRole("combobox", { name: "Search" }).fill("big bre");
  const list = p.getByRole("listbox");
  await list.waitFor({ timeout: 8000 }).catch(() => {});
  ok(await list.isVisible(), "suggestions appear while typing");
  await list.getByRole("option").nth(1).waitFor({ timeout: 10000 }).catch(() => {}); // the matches arrive after a short debounce
  ok((await list.getByRole("option").count()) >= 2, "suggestions include the search action plus matches");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await p.waitForURL(/\/(tag|artist|parody|character|group|g)\//, { timeout: 15000 }).catch(() => {});
  ok(/\/(tag|artist|parody|character|group|g)\//.test(p.url()), "arrow keys + Enter open a suggestion", p.url());
  await p.goto(BASE + "/search?q=" + encodeURIComponent(`tag:"${TAG.replace(/-/g, " ")}" pages:>5`));
  ok((await p.locator("ul li article").count()) > 0, "advanced syntax (tag: + pages:>) returns results");
  // uploaded: used to crash the query (the day count reached Postgres as a bigint); newest works are within the last year
  const up = await p.goto(BASE + "/search?lang=all&q=" + encodeURIComponent("uploaded:<1y"));
  ok(up?.status() === 200 && (await p.locator("ul li article").count()) > 0, "uploaded:<1y returns the recently added works");
  const old = await p.goto(BASE + "/search?lang=all&q=" + encodeURIComponent("uploaded:>20y"));
  ok(old?.status() === 200 && (await p.locator("ul li article").count()) === 0, "uploaded:>20y returns nothing, without an error");
  await p.goto(BASE + "/search?q=" + encodeURIComponent("tag:definitely-not-a-real-tag"));
  ok((await text(p, "h2")).includes("No results"), "an unknown tag shows a clear empty state");
  await ctx.close();
}

/* ───────── 3. filters ───────── */
{
  const ctx = await ctxFor(browser);
  const p = await ctx.newPage();
  await p.goto(BASE + "/browse");
  await p.getByRole("group", { name: "Sort order" }).getByRole("link", { name: "Newest" }).click();
  await p.waitForURL(/sort=new/);
  ok(p.url().includes("sort=new"), "sort link updates the URL");
  await p.getByRole("group", { name: "Categories" }).getByRole("link", { name: "Doujinshi", exact: true }).click();
  await p.waitForURL(/cat=DOUJINSHI/);
  const labels = await p.locator("article >> text=/^(Doujinshi|Manga|Artist CG|Game CG|Western|Image set)$/").allInnerTexts();
  ok(labels.length > 0 && labels.every((l) => l === "Doujinshi"), "category filter only shows that category", labels.slice(0, 4).join(","));
  await ctx.close();
}

/* ───────── 4. favourites ───────── */
{
  const ctx = await ctxFor(browser);
  const p = await ctx.newPage();
  await p.goto(BASE + `/g/${SERIES}`);
  const save = p.getByRole("button", { name: /Save to your library/ });
  await save.click();
  ok((await p.getByRole("button", { name: /Remove from saved/ }).getAttribute("aria-pressed")) === "true", "Save toggles on");
  await p.reload();
  await p.waitForTimeout(500);
  ok(await p.getByRole("button", { name: /Remove from saved/ }).isVisible(), "saved state survives a reload");
  await p.goto(BASE + "/favorites");
  await p.waitForSelector("article", { timeout: 10000 }).catch(() => {});
  ok((await p.locator("article").count()) === 1, "the work shows on the Saved page");
  await ctx.close();
}

/* ───────── 5. reader: scroll mode, progress, resume ───────── */
{
  const ctx = await ctxFor(browser, { storage: { "lm:reader": JSON.stringify({ mode: "scroll" }), "lm:reader-hint": "1" } });
  const p = await ctx.newPage();
  await p.goto(BASE + `/read/${SERIES}/1`);
  await p.waitForSelector("[data-n]");
  const total = await p.locator("[data-n]").count();
  ok(total > 1, "reader renders every page slot", String(total));
  await p.evaluate(() => document.getElementById("pg-4")?.scrollIntoView({ block: "start" }));
  await p.waitForTimeout(1500);
  const hist = JSON.parse((await p.evaluate(() => localStorage.getItem("lm:history"))) ?? "[]");
  ok(hist[0]?.id === Number(SERIES) && hist[0]?.page >= 3, "scrolling records reading progress", JSON.stringify(hist[0]));
  const sliderVal = await p.getByRole("slider", { name: "Page", includeHidden: true }).inputValue();
  ok(Number(sliderVal) >= 3, "the page slider follows the scroll", sliderVal);
  await p.goto(BASE + `/g/${SERIES}`);
  await p.waitForTimeout(600);
  ok((await text(p, "a.btn-primary")).includes("Continue"), "work page offers to continue where you stopped", await text(p, "a.btn-primary"));
  await p.locator("a.btn-primary").first().click();
  await p.waitForURL(/read\/.*\?p=/);
  await p.waitForSelector("[data-n]");
  await p.waitForFunction(() => Math.abs(document.getElementById("pg-" + (new URLSearchParams(location.search).get("p") ?? "1"))?.getBoundingClientRect().top ?? 9999) < 120, undefined, { timeout: 6000 }).catch(() => {});
  const top = await p.evaluate(() => Math.round(document.getElementById("pg-" + (new URLSearchParams(location.search).get("p") ?? "1"))?.getBoundingClientRect().top ?? 9999));
  ok(Math.abs(top) < 120, "Continue lands on the saved page", `top=${top}`);
  await p.keyboard.press("m");
  await p.waitForTimeout(500);
  ok((await p.locator("[data-n]").count()) === 0 && (await p.getByRole("region", { name: "Pages" }).count()) === 1, "M switches to book mode");
  await ctx.close();
}

/* ───────── 5b. start / continue / finished ───────── */
{
  const hist = (e: object) => ({ "lm:history": JSON.stringify([{ at: Date.now(), done: [(e as { ch: number }).ch], ...e }]), "lm:reader-hint": "1" });
  const cases: { name: string; id: string; entry: object; label: string; url: string }[] = [
    { name: "no history", id: SERIES, entry: { id: -1, ch: 1, page: 1, total: 1 }, label: "Start reading", url: "/1?p=1" },
    { name: "mid-chapter", id: SERIES, entry: { id: Number(SERIES), ch: 1, page: 7, total: 34 }, label: "Continue (page 7)", url: "/1?p=7" },
    { name: "finished chapter 1 of a series", id: SERIES, entry: { id: Number(SERIES), ch: 1, page: 34, total: 34 }, label: "Next: chapter 2", url: "/2?p=1" },
    { name: "finished a one-shot", id: ONESHOT, entry: { id: Number(ONESHOT), ch: 1, page: 20, total: 20 }, label: "Read again", url: "/1?p=1" },
  ];
  for (const c of cases) {
    const ctx = await ctxFor(browser, { storage: hist(c.entry) });
    const p = await ctx.newPage();
    await p.goto(BASE + `/g/${c.id}`);
    await p.waitForTimeout(900);
    const btn = p.locator("a.btn-primary").first();
    const label = (await btn.innerText()).trim();
    ok(label === c.label, `${c.name}: the button says "${label}"`, label);
    await btn.click();
    await p.waitForURL((u) => u.pathname.startsWith("/read/"), { timeout: 15000 });
    await p.waitForTimeout(1500);
    const where = await p.evaluate(() => location.pathname + location.search);
    const page = await p.evaluate(() => (document.querySelector('input[aria-label="Page"]') as HTMLInputElement | null)?.value);
    ok(where.endsWith(c.url), `${c.name}: opens ${where}`, where);
    if (c.name !== "mid-chapter") ok(page === "1", `${c.name}: and starts on page 1 (not the end)`, String(page));
    await ctx.close();
  }
}

/* ───────── 6. reader: the book (swipe, keys, tap zones, right-to-left) ───────── */
const BOOK = (rtl: boolean, extra: Record<string, unknown> = {}) => ({
  "lm:reader": JSON.stringify({ mode: "book", rtl, spread: "off", width: 860, dim: 0, ...extra }),
  "lm:reader-hint": "1",
});
/** the page(s) of the slide that is actually on screen (neighbours are in the DOM but hidden) */
const shown = (p: Page) => p.locator('[aria-roledescription="slide"][aria-hidden="false"] img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).alt));
const onPage = async (p: Page, n: number) => {
  await p.waitForFunction((alt) => [...document.querySelectorAll('[aria-roledescription="slide"][aria-hidden="false"] img')].some((e) => (e as HTMLImageElement).alt === alt), `Page ${n}`, { timeout: 4000 }).catch(() => {});
  return (await shown(p)).includes(`Page ${n}`);
};
/** drag across the page like a finger: from x0 to x1 (fractions of the width) */
const drag = async (p: Page, x0: number, x1: number, y = 0.5, slow = false) => {
  const vp = p.viewportSize()!;
  await p.mouse.move(vp.width * x0, vp.height * y);
  await p.mouse.down();
  // a lazy drag (slow) is not a flick, so only distance decides whether the page turns
  const steps = slow ? 8 : 4;
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(vp.width * (x0 + ((x1 - x0) * i) / steps), vp.height * y);
    if (slow) await p.waitForTimeout(90);
  }
  await p.mouse.up();
};
for (const rtl of [false, true]) {
  const dir = rtl ? "RTL" : "LTR";
  const ctx = await ctxFor(browser, { storage: BOOK(rtl) });
  const p = await ctx.newPage();
  await p.goto(BASE + `/read/${SERIES}/1`);
  await p.waitForSelector('[aria-roledescription="slide"][aria-hidden="false"] img');
  ok(await onPage(p, 1), `book ${dir}: opens on page 1`);
  const fwd = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  await p.keyboard.press(fwd);
  ok(await onPage(p, 2), `book ${dir}: ${fwd} turns to the next page`);
  await p.keyboard.press(back);
  ok(await onPage(p, 1), `book ${dir}: ${back} turns back`);

  // swipe: dragging the page toward the spine goes forward (left in LTR, right in RTL)
  await drag(p, rtl ? 0.3 : 0.7, rtl ? 0.7 : 0.3);
  ok(await onPage(p, 2), `book ${dir}: swiping ${rtl ? "right" : "left"} turns forward`);
  await drag(p, rtl ? 0.7 : 0.3, rtl ? 0.3 : 0.7);
  ok(await onPage(p, 1), `book ${dir}: swiping ${rtl ? "left" : "right"} turns back`);
  // a short drag is not enough: the page springs back
  await drag(p, 0.5, rtl ? 0.58 : 0.42, 0.5, true);
  await p.waitForTimeout(450);
  ok(await onPage(p, 1), `book ${dir}: a tiny drag springs back`);
  // past the first page there is nothing to turn to
  await drag(p, rtl ? 0.7 : 0.3, rtl ? 0.3 : 0.7);
  await p.waitForTimeout(450);
  ok(await onPage(p, 1), `book ${dir}: swiping before page 1 stays on page 1`);

  // tap zones
  const vp = p.viewportSize()!;
  await p.mouse.click(Math.round(vp.width * (rtl ? 0.1 : 0.9)), Math.round(vp.height / 2));
  ok(await onPage(p, 2), `book ${dir}: tapping the ${rtl ? "left" : "right"} edge advances`);
  await p.mouse.click(Math.round(vp.width * (rtl ? 0.9 : 0.1)), Math.round(vp.height / 2));
  ok(await onPage(p, 1), `book ${dir}: tapping the ${rtl ? "right" : "left"} edge goes back`);

  // the wheel turns pages too, one flick at a time
  await p.mouse.move(vp.width / 2, vp.height / 2);
  await p.mouse.wheel(0, 120);
  ok(await onPage(p, 2), `book ${dir}: the mouse wheel turns the page`);
  await ctx.close();
}

{
  // zoom: double-click zooms in, again resets; arrows leave zoom behind
  const ctx = await ctxFor(browser, { storage: BOOK(false) });
  const p = await ctx.newPage();
  await p.goto(BASE + `/read/${SERIES}/1`);
  await p.waitForSelector('[aria-roledescription="slide"][aria-hidden="false"] img');
  const vp = p.viewportSize()!;
  const zoomOf = () => p.locator('[aria-roledescription="carousel"] > div').first().evaluate((el) => (el as HTMLElement).style.transform);
  ok((await zoomOf()) === "", "book: starts un-zoomed");
  await p.waitForTimeout(600); // taps in the first moments after opening are ignored on purpose (double-click on the open button)
  await p.mouse.dblclick(vp.width / 2, vp.height / 2);
  await p.waitForTimeout(350);
  ok(/scale\(2\.4\)/.test(await zoomOf()), "book: double-tap zooms in", await zoomOf());
  ok((await p.getByRole("button", { name: "Reset zoom", includeHidden: true }).count()) === 1, "book: the zoom button reflects the zoom state");
  await drag(p, 0.6, 0.4); // panning while zoomed must not turn the page
  ok(await onPage(p, 1), "book: dragging while zoomed pans instead of turning");
  await p.mouse.dblclick(vp.width / 2, vp.height / 2);
  await p.waitForTimeout(350);
  ok((await zoomOf()) === "", "book: double-tap again resets the zoom", await zoomOf());
  await p.keyboard.press("z");
  await p.waitForTimeout(350);
  ok(/scale\(2\.4\)/.test(await zoomOf()), "book: Z toggles zoom");
  await p.keyboard.press("ArrowRight");
  ok(await onPage(p, 2), "book: turning the page works from a zoomed page");
  await p.waitForTimeout(350);
  ok((await zoomOf()) === "", "book: a new page starts un-zoomed", await zoomOf());
  await ctx.close();
}

{
  // spreads: two pages side by side on a wide screen, the cover on its own, RTL puts the first page on the right
  for (const rtl of [false, true]) {
    const ctx = await ctxFor(browser, { width: 1440, height: 800, storage: BOOK(rtl, { spread: "auto" }) });
    const p = await ctx.newPage();
    await p.goto(BASE + `/read/${SERIES}/1`);
    await p.waitForSelector('[aria-roledescription="slide"][aria-hidden="false"] img');
    ok((await shown(p)).length === 1 && (await onPage(p, 1)), `spread ${rtl ? "RTL" : "LTR"}: the cover stands alone`);
    await p.keyboard.press(rtl ? "ArrowLeft" : "ArrowRight");
    await p.waitForFunction(() => document.querySelectorAll('[aria-roledescription="slide"][aria-hidden="false"] img').length === 2, undefined, { timeout: 4000 }).catch(() => {});
    const pair = await shown(p);
    ok(pair.length === 2 && pair.includes("Page 2") && pair.includes("Page 3"), `spread ${rtl ? "RTL" : "LTR"}: pages 2 and 3 are shown together`, pair.join(","));
    const xs = await p.locator('[aria-roledescription="slide"][aria-hidden="false"] img').evaluateAll((els) => els.map((e) => ({ alt: (e as HTMLImageElement).alt, x: e.getBoundingClientRect().x })));
    const left = xs.sort((a, b) => a.x - b.x)[0]?.alt;
    ok(left === (rtl ? "Page 3" : "Page 2"), `spread ${rtl ? "RTL" : "LTR"}: reading order puts ${rtl ? "page 3 on the left" : "page 2 on the left"}`, left);
    await ctx.close();
  }
  // on a phone the same book is one page at a time
  const phone = await ctxFor(browser, { width: 390, height: 844, mobile: true, storage: BOOK(false, { spread: "auto" }) });
  const pp = await phone.newPage();
  await pp.goto(BASE + `/read/${SERIES}/1`);
  await pp.waitForSelector('[aria-roledescription="slide"][aria-hidden="false"] img');
  await pp.keyboard.press("ArrowRight");
  await onPage(pp, 2);
  ok((await shown(pp)).length === 1, "spread: a phone shows one page at a time");
  await phone.close();
}

{
  // the first-run tip appears once and is remembered; an old "paged" setting becomes the book
  const ctx = await ctxFor(browser, { storage: { "lm:reader": JSON.stringify({ mode: "paged", rtl: false }) } });
  const p = await ctx.newPage();
  await p.goto(BASE + `/read/${SERIES}/1`);
  const tip = p.getByRole("button", { name: "Dismiss reading tips" });
  await tip.waitFor({ timeout: 6000 }).catch(() => {});
  ok(await tip.isVisible(), "book: first visit shows the reading tips");
  ok((await p.getByRole("region", { name: "Pages" }).count()) === 1, "a stored \"paged\" preference opens as the book");
  await tip.click();
  await p.waitForTimeout(300);
  ok((await tip.count()) === 0, "tips close on tap");
  await p.reload();
  await p.waitForSelector('[aria-roledescription="slide"][aria-hidden="false"] img');
  await p.waitForTimeout(600);
  ok((await p.getByRole("button", { name: "Dismiss reading tips" }).count()) === 0, "tips do not come back");
  await ctx.close();
}

/* ───────── 7. settings: language + hidden tag change the lists ───────── */
{
  const ctx = await ctxFor(browser);
  const p = await ctx.newPage();
  await p.goto(BASE + "/browse?lang=all");
  const all = await p.locator("article >> text=/^(EN|JA|PT|ES|FR|RU|VI|ID|PL|AR|ZH|KO)$/i").allInnerTexts();
  const langsAll = new Set(all.map((s) => s.toUpperCase()));
  await p.goto(BASE + "/settings");
  await p.getByRole("button", { name: "English", exact: true }).click();
  await p.waitForTimeout(800);
  ok(decodeURIComponent((await cookie(ctx, "lm_prefs")) ?? "").includes('"en"'), "choosing a language saves it");
  await p.goto(BASE + "/browse");
  const only = new Set((await p.locator("article >> text=/^(EN|JA|PT|ES|FR|RU|VI|ID|PL|AR|ZH|KO)$/i").allInnerTexts()).map((s) => s.toUpperCase()));
  ok(only.size === 1 && only.has("EN"), "lists then show only that language", [...only].join(","));
  ok(langsAll.size >= 1, "(control) the unfiltered list had works", [...langsAll].join(","));

  // hide a tag, then confirm a work that has it disappears from the home lists
  await p.goto(BASE + "/settings");
  await p.getByPlaceholder("Find a tag to hide").fill(TAG.replace(/-/g, " "));
  await p.getByRole("list", { name: "Matching tags" }).waitFor({ timeout: 8000 }).catch(() => {});
  await p.getByRole("list", { name: "Matching tags" }).getByRole("button").first().click();
  await p.waitForTimeout(800);
  ok((await p.getByRole("list", { name: "Hidden tags" }).count()) === 1, "a tag can be hidden");
  const tagPage = await p.goto(BASE + `/tag/${TAG}?lang=all`);
  ok(tagPage?.status() === 200 && (await p.locator("article").count()) > 0, "an explicitly opened tag page still works while the tag is hidden elsewhere");
  await p.goto(BASE + "/browse?lang=all&sort=new");
  const prefsNow = decodeURIComponent((await cookie(ctx, "lm_prefs")) ?? "");
  ok(/"hide":\[\{"id":\d+/.test(prefsNow), "hidden tag is stored for the server to apply", prefsNow.slice(0, 80));
  await ctx.close();
}

/* ───────── 8. mobile chrome ───────── */
{
  const ctx = await ctxFor(browser, { width: 390, height: 844, mobile: true });
  const p = await ctx.newPage();
  await p.goto(BASE + "/");
  ok(await p.getByRole("navigation", { name: "Primary" }).isVisible(), "phone: bottom tab bar is visible");
  await p.getByRole("button", { name: "Search" }).first().click();
  ok(await p.getByRole("combobox", { name: "Search" }).isVisible(), "phone: search opens as a full-width bar");
  await p.getByRole("button", { name: "Cancel" }).click();
  const tapSizes = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Primary] a")].map((a) => Math.round((a as HTMLElement).getBoundingClientRect().height)));
  ok(tapSizes.every((h) => h >= 44), "phone: tab bar targets are at least 44px tall", tapSizes.join(","));
  await ctx.close();
  const d = await ctxFor(browser, { width: 1440, height: 900 });
  const dp = await d.newPage();
  await dp.goto(BASE + "/");
  ok(!(await dp.getByRole("navigation", { name: "Primary" }).isVisible()), "desktop: no bottom tab bar");
  ok(await dp.getByRole("navigation", { name: "Main" }).isVisible(), "desktop: main navigation is shown");
  await d.close();
}

/* ───────── 9. misc ───────── */
{
  const ctx = await ctxFor(browser);
  const p = await ctx.newPage();
  await p.goto(BASE + "/random");
  await p.waitForURL((u) => /\/g\/\d+-/.test(u.pathname), { timeout: 40000 }).catch(() => {}); // /random redirects, then the slug is canonicalised (slow when the database is far away)
  ok(/\/g\/\d+-/.test(p.url()), "random lands on a work page", p.url());
  const bad = await p.goto(BASE + "/g/99999999");
  ok(bad?.status() === 404, "a missing work is a real 404");
  await p.goto(BASE + "/tag/this-tag-does-not-exist");
  ok((await p.title()).length > 0 && (await text(p, "h1")).includes("Nothing here"), "a missing tag shows the friendly 404");
  await p.goto(BASE + "/report-content");
  const send = p.getByRole("button", { name: "Send report" });
  ok(await send.isDisabled(), "report form refuses an empty report");
  await p.getByLabel("Details").fill("QA TEST please ignore this automated report");
  await send.click();
  await p.getByRole("status").waitFor({ timeout: 8000 }).catch(() => {});
  ok((await text(p, "[role=status] h2")).includes("Report received"), "report form submits");
  const removed = await prisma.report.deleteMany({ where: { details: { startsWith: "QA TEST" } } });
  ok(removed.count >= 1, "(cleanup) test report was stored, now removed", String(removed.count));
  await ctx.close();
}

/* ───────── 12. features competitors have: sorts, updates, saves, following, advanced search, backup, download, reader extras ───────── */
{
  // popularity windows
  const ctx = await ctxFor(browser);
  const p = await ctx.newPage();
  const sortLinks = p.getByRole("group", { name: "Sort order" }).getByRole("link");
  await p.goto(BASE + "/browse?lang=all");
  ok((await sortLinks.allInnerTexts()).map((t) => t.trim()).join("|") === "Popular|Trending|This week|This month|Top rated|Most saved|Newest", "browse: seven sort orders (popular, trending, week, month, top rated, most saved, newest)", (await sortLinks.allInnerTexts()).join("|"));
  for (const s of ["trending", "week", "month", "rated", "saved", "new"]) {
    const r = await p.goto(BASE + `/browse?lang=all&sort=${s}`);
    ok(r?.status() === 200 && (await p.locator("ul li article").count()) > 0, `browse: sort=${s} lists works`, String(r?.status()));
    ok((await p.getByRole("group", { name: "Sort order" }).locator('[aria-current="true"]').count()) === 1, `browse: sort=${s} is marked as the active sort`);
  }
  await p.goto(BASE + "/browse?lang=all&sort=bogus");
  ok((await p.getByRole("group", { name: "Sort order" }).locator('[aria-current="true"]').first().innerText()).trim() === "Popular", "browse: an unknown sort falls back to popular");

  // latest updates
  const up = await p.goto(BASE + "/updates?lang=all");
  ok(up?.status() === 200 && (await p.locator("ul li article").count()) > 0, "updates: lists series with new chapters");
  ok(/Chapter [\d.]+ · /.test((await p.locator("ul li article").first().innerText())), "updates: each card says which chapter and when", (await p.locator("ul li article").first().innerText()).replace(/\n/g, " "));

  // page jump
  await p.goto(BASE + "/browse?lang=all");
  await p.locator("#page-jump").fill("5");
  await p.getByRole("button", { name: "Go" }).click();
  await p.waitForURL(/page=5/, { timeout: 30000 });
  ok(/page=5/.test(p.url()), "pagination: jump to a page by number", p.url());
  await ctx.close();
}

{
  // public save count: +1 on save, back to what it was on un-save (the cookie remembers this browser counted)
  const ctx = await ctxFor(browser, { count: true });
  const before = (await prisma.work.findFirst({ where: { publicId: Number(SERIES) }, select: { favorites: true } }))!.favorites;
  const on = await ctx.request.post(BASE + "/api/favorite", { data: { id: Number(SERIES), on: true } });
  const again = await ctx.request.post(BASE + "/api/favorite", { data: { id: Number(SERIES), on: true } });
  const mid = (await prisma.work.findFirst({ where: { publicId: Number(SERIES) }, select: { favorites: true } }))!.favorites;
  ok(on.status() === 204 && again.status() === 204 && mid === before + 1, "saves: counted once per visitor, however often the request repeats", `${before} -> ${mid}`);
  const off = await ctx.request.post(BASE + "/api/favorite", { data: { id: Number(SERIES), on: false } });
  const after = (await prisma.work.findFirst({ where: { publicId: Number(SERIES) }, select: { favorites: true } }))!.favorites;
  ok(off.status() === 204 && after === before, "saves: un-saving takes it back", `${mid} -> ${after}`);
  ok((await ctx.request.post(BASE + "/api/favorite", { data: { id: "x", on: true } })).status() === 400, "saves: a bad request is refused");
  // the work page shows the count and the button keeps its accessible name
  await prisma.work.updateMany({ where: { publicId: Number(SERIES) }, data: {} });
  const p = await ctx.newPage();
  await p.goto(BASE + `/g/${SERIES}`);
  ok((await p.getByRole("button", { name: /Save to your library/ }).count()) === 1, "saves: the save button is on the work page");
  // daily views behind trending
  const day = await prisma.workViewDay.count();
  ok(day >= 0, "trending: the daily views table exists");
  // more from this artist
  const more = await p.locator('section[aria-label^="More from"]').count();
  console.log(`info  work ${SERIES}: ${more} "More from ..." row(s)`);
  await ctx.close();
}

{
  // follow a tag, see its works on Following, unfollow
  const ctx = await ctxFor(browser);
  const p = await ctx.newPage();
  await p.goto(BASE + "/following");
  ok(await p.getByText("You are not following anything yet").waitFor({ timeout: 20000 }).then(() => true, () => false), "following: starts empty with instructions");
  await p.goto(BASE + `/tag/${TAG}?lang=all`);
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Follow", exact: true }).click();
  ok(await p.getByRole("button", { name: "Following", exact: true }).isVisible(), "following: the button becomes Following");
  await p.goto(BASE + "/following");
  await p.waitForSelector("ul li article", { timeout: 60000 }).catch(() => {});
  ok((await p.locator("ul li article").count()) > 0, "following: new works from the followed tag appear");
  ok((await p.getByRole("list", { name: "Followed" }).getByRole("link").count()) === 1, "following: the followed tag is listed");
  await p.getByRole("button", { name: /^Unfollow/ }).click();
  ok(await p.getByText("You are not following anything yet").waitFor({ timeout: 10000 }).then(() => true, () => false), "following: unfollowing empties the feed");
  await ctx.close();
}

{
  // advanced search: pick a tag, set a page range, search
  const ctx = await ctxFor(browser);
  const p = await ctx.newPage();
  await p.goto(BASE + "/search");
  await p.getByRole("button", { name: "Advanced filters" }).click();
  await p.getByLabel("Find a tag, artist, parody or character").fill(TAG.replace(/-/g, " "));
  await p.getByRole("list", { name: "Matches" }).getByRole("button").first().click({ timeout: 20000 });
  ok(await p.getByRole("list", { name: "Chosen" }).isVisible(), "advanced search: a picked tag appears as a chip");
  await p.getByLabel("Minimum pages").fill("5");
  await p.getByRole("button", { name: "Search with these filters" }).click();
  await p.waitForURL(/search\?.*q=/, { timeout: 30000 });
  const q = decodeURIComponent(new URL(p.url()).searchParams.get("q") ?? "");
  ok(/tag:/.test(q) && /pages:>=5/.test(q), "advanced search: builds the search syntax", q);
  await p.waitForSelector("ul li article", { timeout: 30000 }).catch(() => {});
  ok((await p.locator("ul li article").count()) > 0, "advanced search: the results load");
  ok(await p.getByRole("button", { name: "Hide advanced filters" }).isVisible(), "advanced search: the panel reopens showing the active filters");
  ok((await p.getByRole("list", { name: "Chosen" }).getByRole("button").count()) === 1, "advanced search: ...and the chip is still there");
  await ctx.close();
}

{
  // recent searches
  const ctx = await ctxFor(browser);
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "load" });
  await p.waitForTimeout(1500);
  const box = p.getByRole("combobox", { name: "Search" });
  await box.fill("school life");
  await box.press("Enter");
  await p.waitForURL(/search\?q=/, { timeout: 30000 });
  await p.goto(BASE + "/browse?lang=all");
  await p.waitForTimeout(1200);
  await p.getByRole("combobox", { name: "Search" }).click();
  ok(await p.getByRole("option", { name: /school life/ }).isVisible({ timeout: 5000 }).catch(() => false), "search box: offers the recent search when empty");
  await ctx.close();
}

{
  // read marks on cards, backup and restore
  const entry = { id: Number(SERIES), ch: 1, page: 10, total: 34, at: Date.now(), done: [] };
  const ctx = await ctxFor(browser, { storage: { "lm:history": JSON.stringify([entry]), "lm:fav": JSON.stringify([Number(SERIES)]), "lm:reader-hint": "1" } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/history");
  await p.waitForSelector("article", { timeout: 30000 });
  ok((await p.getByRole("img", { name: "Page 10 of 34" }).count()) === 1, "cards: a work in progress shows a progress bar");
  await p.goto(BASE + "/settings");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Download backup" }).click()]);
  const file = await dl.path();
  const fs = await import("node:fs");
  const backup = JSON.parse(fs.readFileSync(file!, "utf8"));
  ok(backup.v === 1 && backup.fav.includes(Number(SERIES)) && backup.history[0]?.id === Number(SERIES), "backup: the file holds the saved work and history", JSON.stringify(backup).slice(0, 120));
  // restore into a fresh browser
  const fresh = await ctxFor(browser);
  const fp = await fresh.newPage();
  await fp.goto(BASE + "/settings");
  await fp.locator('input[type="file"]').setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await fp.getByRole("status").waitFor({ timeout: 10000 });
  ok(/Restored 1 saved/.test(await fp.getByRole("status").innerText()), "backup: restoring reports what came back", await fp.getByRole("status").innerText());
  const favNow = JSON.parse((await fp.evaluate(() => localStorage.getItem("lm:fav"))) ?? "[]");
  ok(favNow.includes(Number(SERIES)), "backup: the saved work is in the new browser");
  await fp.locator('input[type="file"]').setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("not a backup") });
  ok(/not a LustPages backup/.test(await fp.getByRole("status").innerText()), "backup: a wrong file is refused");
  await fresh.close();
  await ctx.close();
}

{
  // download a one-shot as CBZ (the browser fetches the pages and zips them)
  const ctx = await ctxFor(browser);
  await ctx.unroute(`https://${CDN}/**`);
  await ctx.route(`https://${CDN}/**`, (r) => r.fulfill({ status: 200, contentType: "image/png", body: png, headers: { "access-control-allow-origin": "*" } }));
  const p = await ctx.newPage();
  await p.goto(BASE + `/g/${ONESHOT}`);
  await p.waitForTimeout(800);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 120000 }), p.getByRole("button", { name: /^Download$/ }).click()]);
  const name = dl.suggestedFilename();
  const { unzipSync } = await import("fflate");
  const fs = await import("node:fs");
  const files = unzipSync(new Uint8Array(fs.readFileSync((await dl.path())!)));
  const names = Object.keys(files);
  ok(name.endsWith(".cbz"), "download: the file is a .cbz named after the work", name);
  ok(names[0] === "ComicInfo.xml" && names.length > 2 && names[1] === "001.webp", "download: ComicInfo.xml, then the numbered pages", names.slice(0, 4).join(","));
  ok(Buffer.from(files["ComicInfo.xml"]).toString().includes("Adults Only 18+"), "download: ComicInfo carries the adult rating");
  await ctx.close();
}

{
  // reader extras: auto-play turns pages, background, first page paired
  const ctx = await ctxFor(browser, { storage: BOOK(false, { autoSpeed: 3 }) });
  const p = await ctx.newPage();
  await p.goto(BASE + `/read/${SERIES}/1`);
  await p.waitForSelector('[aria-roledescription="slide"][aria-hidden="false"] img');
  await p.waitForTimeout(700);
  ok(await onPage(p, 1), "auto-play: starts on page 1");
  await p.keyboard.press("p");
  ok(await p.waitForFunction(() => [...document.querySelectorAll('[aria-roledescription="slide"][aria-hidden="false"] img')].some((e) => (e as HTMLImageElement).alt === "Page 2"), undefined, { timeout: 9000 }).then(() => true, () => false), "auto-play: turns the page by itself (fast = every 3 seconds)");
  await p.keyboard.press("p");
  const stay = await shown(p);
  await p.waitForTimeout(4200);
  ok(JSON.stringify(await shown(p)) === JSON.stringify(stay), "auto-play: pausing stops the turning", stay.join(","));
  await ctx.close();

  const sepia = await ctxFor(browser, { storage: BOOK(false, { bg: "sepia" }) });
  const sp = await sepia.newPage();
  await sp.goto(BASE + `/read/${SERIES}/1`);
  await sp.waitForSelector('[aria-roledescription="carousel"]');
  const bg = await sp.locator('[aria-roledescription="carousel"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  ok(bg === "rgb(239, 227, 200)", "reader background: sepia", bg);
  await sepia.close();

  const wide = await ctxFor(browser, { width: 1440, height: 800, storage: BOOK(false, { spread: "auto", coverAlone: false }) });
  const wp = await wide.newPage();
  await wp.goto(BASE + `/read/${SERIES}/1`);
  await wp.waitForSelector('[aria-roledescription="slide"][aria-hidden="false"] img');
  await wp.waitForFunction(() => document.querySelectorAll('[aria-roledescription="slide"][aria-hidden="false"] img').length === 2, undefined, { timeout: 8000 }).catch(() => {});
  ok((await shown(wp)).length === 2 && (await shown(wp)).includes("Page 1") && (await shown(wp)).includes("Page 2"), "spread: with the cover not on its own, pages 1 and 2 are paired", (await shown(wp)).join(","));
  await wide.close();
}

/* ───────── 10. hostile input never becomes a server error ───────── */
{
  const ctx = await ctxFor(browser);
  const urls = [
    "/g/99999999999", "/g/0", "/g/-5", "/read/99999999999/1", "/read/74/NaN", "/read/74/1e99", "/read/74/1?p=abc",
    "/search?q=pages:%3E99999999999", "/search?q=uploaded:%3C99999999999y", "/search?q=tag:%00", "/search?q=%00", "/search?q=%21%21%21",
    "/browse?page=abc", "/browse?page=99999999", "/browse?page=-4", "/browse?lang=zz,en&cat=NOPE&sort=weird",
    "/tags?page=99999", "/tags?q=%25", "/artists?letter=%00", "/tag/big-breasts?page=99999",
    "/api/works?ids=1,2,abc,99999999999", "/api/suggest?q=%00%00", "/api/suggest?q=%25%25",
  ];
  const bad: string[] = [];
  for (const u of urls) {
    const r = await ctx.request.get(BASE + u, { maxRedirects: 3 });
    if (r.status() >= 500) bad.push(`${u} -> ${r.status()}`);
  }
  ok(bad.length === 0, `${urls.length} hostile or malformed URLs: none is a 5xx`, bad.join("; "));

  // a work whose title is Japanese/Chinese has a non-ASCII slug: redirecting to it must not put raw characters in the Location header
  const uni = process.env.QA_UNICODE ?? "115";
  const bare = await ctx.request.get(BASE + "/g/" + uni, { maxRedirects: 0 });
  const loc = bare.headers()["location"] ?? "";
  ok(bare.status() === 308 && /^[!-~]+$/.test(loc), "a bare link to a work with a non-ASCII title redirects to a valid URL", `${bare.status()} ${loc}`);
  const landed = await ctx.request.get(BASE + "/g/" + uni);
  ok(landed.status() === 200, "...and that page loads", String(landed.status()));

  const view = await ctx.request.post(BASE + "/api/view", { data: { id: 99999999999 } });
  ok(view.status() === 400, "view ping with an oversized id is rejected, not a crash", String(view.status()));
  const rep = await ctx.request.post(BASE + "/api/report", { data: { kind: "DMCA", details: "QA TEST not an email", contact: "not-an-email" } });
  ok(rep.status() === 400, "a takedown request without a real email is refused", String(rep.status()));
  const rep2 = await ctx.request.post(BASE + "/api/report", { data: { kind: "BROKEN", work: 99999999999, details: "QA TEST oversized work id" } });
  ok(rep2.status() === 400, "a report with an oversized work number is refused, not a crash", String(rep2.status()));

  // a long ?page deep into a list lands back on page 1 instead of an empty screen
  const p = await ctx.newPage();
  await p.goto(BASE + "/browse?lang=all&page=500");
  ok(!p.url().includes("page=500") && (await p.locator("article").count()) > 0, "a page number past the end goes back to the first page", p.url());
  await p.goto(BASE + "/search?q=%21%21%21");
  ok((await p.getByRole("link", { name: "How to write advanced searches" }).count()) === 1, "a query of only punctuation shows the search help, not every work");
  await ctx.close();
}

/* ───────── 11. reader: keyboard, focus and dialogs ───────── */
{
  const ctx = await ctxFor(browser, { storage: BOOK(false) });
  const p = await ctx.newPage();
  await p.goto(BASE + `/read/${SERIES}/1`);
  await p.waitForSelector('[aria-roledescription="slide"][aria-hidden="false"] img');
  await p.waitForTimeout(600);
  // the settings dialog is modal: arrows and space must not turn the page behind it
  await p.keyboard.press("s");
  await p.getByRole("dialog", { name: "Reader settings" }).waitFor({ timeout: 3000 });
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press(" ");
  ok(await onPage(p, 1), "reader: keys do not turn the page behind the settings dialog");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  ok((await p.getByRole("dialog").count()) === 0, "reader: Escape closes the settings dialog");

  // with the bars tucked away, Tab brings them back with focus on the first control
  await p.waitForTimeout(3600);
  const hidden = await p.locator("header").first().evaluate((el) => getComputedStyle(el).visibility);
  ok(hidden === "hidden", "reader: the hidden bars are out of the tab order (visibility)", hidden);
  await p.keyboard.press("Tab");
  await p.waitForTimeout(500);
  const focused = await p.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);
  ok(focused === "Back to details", "reader: Tab reveals the bars and focuses the first control", String(focused));

  // Space on a focused button is that button's action, not "next page"
  await p.keyboard.press("Tab"); // the next control after "Back": auto-play
  await p.keyboard.press(" ");
  await p.waitForTimeout(300);
  ok(await onPage(p, 1), "reader: Space on a focused button does not also turn the page");
  await ctx.close();
}

await browser.close();
await prisma.$disconnect();
const failed = results.filter(([c]) => !c).length;
console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
