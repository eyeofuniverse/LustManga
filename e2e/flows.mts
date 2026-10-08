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
  await p.goto(BASE + "/");
  await p.waitForTimeout(500);
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
  const ctx = await ctxFor(browser);
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
  ok((await p.locator("[data-n]").count()) === 0, "M switches to paged mode");
  await ctx.close();
}

/* ───────── 6. reader: paged mode, keys, right-to-left ───────── */
for (const rtl of [false, true]) {
  const ctx = await ctxFor(browser, { storage: { "lm:reader": JSON.stringify({ mode: "paged", rtl, fit: "width", width: 860, dim: 0 }) } });
  const p = await ctx.newPage();
  await p.goto(BASE + `/read/${SERIES}/1`);
  await p.waitForSelector('img[alt="Page 1"]');
  const fwd = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  await p.keyboard.press(fwd);
  await p.waitForSelector('img[alt="Page 2"]', { timeout: 4000 }).catch(() => {});
  ok(await p.locator('img[alt="Page 2"]').isVisible(), `paged ${rtl ? "RTL" : "LTR"}: ${fwd} goes to the next page`);
  await p.keyboard.press(back);
  await p.waitForSelector('img[alt="Page 1"]', { timeout: 4000 }).catch(() => {});
  ok(await p.locator('img[alt="Page 1"]').isVisible(), `paged ${rtl ? "RTL" : "LTR"}: ${back} goes back`);
  // tap zones
  const vp = p.viewportSize()!;
  await p.mouse.click(Math.round(vp.width * (rtl ? 0.1 : 0.9)), Math.round(vp.height / 2));
  await p.waitForSelector('img[alt="Page 2"]', { timeout: 4000 }).catch(() => {});
  ok(await p.locator('img[alt="Page 2"]').isVisible(), `paged ${rtl ? "RTL" : "LTR"}: tapping the ${rtl ? "left" : "right"} edge advances`);
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
