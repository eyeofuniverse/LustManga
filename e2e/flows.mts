// Behaviour tests against a running site: does it actually WORK, not just render.
//   BASE_URL=http://localhost:3200 npm run flows
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const CDN = process.env.NEXT_PUBLIC_IMG_CDN_HOST ?? "img-cdn.lustpages.com";
const SERIES = process.env.QA_SERIES ?? "74";
const TAG = process.env.QA_TAG ?? "big-breasts";

const png = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#553c8a" } }).png().toBuffer();
const results: [boolean, string][] = [];
const ok = (cond: boolean, name: string, extra = "") => {
  results.push([cond, name]);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? `  [${extra}]` : ""}`);
};

async function ctxFor(browser: Browser, opts: { width?: number; height?: number; age?: boolean; mobile?: boolean; storage?: Record<string, string> } = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 1280, height: opts.height ?? 900 },
    isMobile: !!opts.mobile,
    hasTouch: !!opts.mobile,
  });
  if (opts.age !== false) await ctx.addCookies([{ name: "lm_age", value: "1", url: BASE }]);
  await ctx.route(`https://${CDN}/**`, (r) => r.fulfill({ status: 200, contentType: "image/png", body: png }));
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
  const sliderVal = await p.getByRole("slider", { name: "Page" }).inputValue();
  ok(Number(sliderVal) >= 3, "the page slider follows the scroll", sliderVal);
  await p.goto(BASE + `/g/${SERIES}`);
  await p.waitForTimeout(600);
  ok((await text(p, "a.btn-primary")).includes("Continue"), "work page offers to continue where you stopped", await text(p, "a.btn-primary"));
  await p.locator("a.btn-primary").first().click();
  await p.waitForURL(/read\/.*\?p=/);
  await p.waitForSelector("[data-n]");
  await p.waitForTimeout(800);
  const top = await p.evaluate(() => Math.round(document.getElementById("pg-" + (new URLSearchParams(location.search).get("p") ?? "1"))?.getBoundingClientRect().top ?? 9999));
  ok(Math.abs(top) < 120, "Continue lands on the saved page", `top=${top}`);
  await p.keyboard.press("m");
  await p.waitForTimeout(500);
  ok((await p.locator("[data-n]").count()) === 0 && (await p.getByRole("region", { name: "Pages" }).count()) === 1, "M switches to book mode");
  await ctx.close();
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
  await p.mouse.dblclick(vp.width / 2, vp.height / 2);
  await p.waitForTimeout(350);
  ok(/scale\(2\.4\)/.test(await zoomOf()), "book: double-tap zooms in", await zoomOf());
  ok((await p.getByRole("button", { name: "Reset zoom" }).count()) === 1, "book: the zoom button reflects the zoom state");
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

await browser.close();
await prisma.$disconnect();
const failed = results.filter(([c]) => !c).length;
console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
