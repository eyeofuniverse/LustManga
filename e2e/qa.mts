// Browser QA: loads every public page at phone / tablet / desktop sizes and reports
//   - HTTP status, console + page errors, failed requests (other than the image CDN)
//   - horizontal overflow (a page wider than the screen)
//   - serious / critical accessibility violations (axe, WCAG 2 A + AA)
// Cover and page images are replaced with a neutral placeholder, so it checks layout, not content.
//   npm run build && npx next start -p 3200      (in one terminal)
//   BASE_URL=http://localhost:3200 npm run qa     (in another)
import { mkdirSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const OUT = process.env.QA_OUT ?? "qa-shots";
const CDN = process.env.NEXT_PUBLIC_IMG_CDN_HOST ?? "img-cdn.lustpages.com";
const SERIES = process.env.QA_SERIES ?? "74";
const ONESHOT = process.env.QA_ONESHOT ?? "113";
const TAG = process.env.QA_TAG ?? "big-breasts";
const ARTIST = process.env.QA_ARTIST ?? "hamada-yoshikazu";
const THEME = process.env.QA_THEME ?? "dark";

mkdirSync(OUT, { recursive: true });

const placeholder = await sharp({
  create: { width: 600, height: 900, channels: 3, background: { r: 70, g: 60, b: 110 } },
})
  .composite([{ input: Buffer.from(`<svg width="600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b3b8c"/><stop offset="1" stop-color="#c0396b"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><circle cx="300" cy="420" r="90" fill="#ffffff22"/></svg>`) }])
  .png()
  .toBuffer();

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "tablet", width: 820, height: 1180, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
] as const;

const PAGES: [string, string][] = [
  ["home", "/"],
  ["browse", "/browse"],
  ["browse-new", "/browse?sort=new&lang=all"],
  ["tags", "/tags"],
  ["artists", "/artists"],
  ["parodies", "/parodies"],
  ["tag", `/tag/${TAG}`],
  ["artist", `/artist/${ARTIST}`],
  ["search", "/search?q=school"],
  ["search-empty", "/search"],
  ["search-help", "/search/help"],
  ["work-series", `/g/${SERIES}`],
  ["work-oneshot", `/g/${ONESHOT}`],
  ["reader-book", `/read/${SERIES}/1`],
  ["reader-scroll", `/read/${SERIES}/1`],
  ["updates", "/updates?lang=all"],
  ["following", "/following"],
  ["search-advanced", "/search?q=tag%3Aschool"],
  ["favorites", "/favorites"],
  ["history", "/history"],
  ["settings", "/settings"],
  ["report", "/report-content"],
  ["dmca", "/dmca"],
  ["privacy", "/privacy"],
  ["not-found", "/g/99999999"],
];

async function newContext(browser: import("playwright").Browser, vp: (typeof VIEWPORTS)[number], opts: { age?: boolean } = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile && vp.width < 700,
    hasTouch: vp.mobile,
    deviceScaleFactor: 1,
    colorScheme: THEME === "light" ? "light" : "dark",
  });
  await ctx.addCookies([{ name: "lm_nocount", value: "1", url: BASE }]); // never count QA visits as readers
  if (opts.age !== false) await ctx.addCookies([{ name: "lm_age", value: "1", url: BASE }]);
  await ctx.addInitScript((t) => { localStorage.setItem("lm:theme", t); localStorage.setItem("lm:reader-hint", "1"); }, THEME);
  if (!process.env.QA_NOROUTE) await ctx.route(`https://${CDN}/**`, (r) => r.fulfill({ status: 200, contentType: "image/png", body: placeholder, headers: { "cache-control": "public, max-age=3600" } }));
  return ctx;
}

interface Row {
  vp: string;
  page: string;
  status: number;
  overflow: number;
  errors: string[];
  axe: string[];
  ms: number;
}

async function check(page: Page, vp: string, name: string, path: string, shot: boolean): Promise<Row> {
  const errors: string[] = [];
  const onErr = (m: import("playwright").ConsoleMessage) => m.type() === "error" && !m.text().includes("Failed to load resource") && errors.push(m.text().slice(0, Number(process.env.QA_ERRLEN ?? 160)));
  page.on("console", onErr);
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, Number(process.env.QA_ERRLEN ?? 160))}`));
  // the reader remembers its mode: pick the one this row is about (the first row has no origin yet, hence the catch)
  if (name.startsWith("reader")) await page.evaluate((m) => localStorage.setItem("lm:reader", JSON.stringify({ mode: m })), name === "reader-scroll" ? "scroll" : "book").catch(() => {});
  const t0 = Date.now();
  const res = await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForTimeout(1500); // let hydration finish (errors can surface a second or two late)
  // client-rendered lists (history/favorites) fade in; measure colours only once the entrance animations have settled
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), undefined, { timeout: 6000 })
    .catch(() => {});
  const ms = Date.now() - t0;
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  const axe = (process.env.QA_NOAXE ? [] : (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations)
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} x${v.nodes.length} (${v.nodes[0]?.target?.join(" ").slice(0, 60)})`);
  if (shot) {
    // scroll through the page so lazy images load, then come back to the top for the capture
    await page.evaluate(async () => {
      const h = window.innerHeight;
      for (let y = 0; y < Math.min(document.body.scrollHeight, 14000); y += h * 0.8) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(700);
  }
  if (shot) await page.screenshot({ path: `${OUT}/${THEME}-${vp}-${name}.png`, fullPage: !name.startsWith("reader") });
  page.off("console", onErr);
  return { vp, page: name, status: res?.status() ?? 0, overflow, errors, axe, ms };
}

const browser = await chromium.launch();
const rows: Row[] = [];
for (const vp of VIEWPORTS.filter((v) => !process.env.QA_ONLY || process.env.QA_ONLY.split(",").includes(v.name))) {
  const ctx = await newContext(browser, vp);
  const page = await ctx.newPage();
  for (const [name, path] of PAGES.filter(([n]) => !process.env.QA_PAGES || process.env.QA_PAGES.split(",").includes(n))) rows.push(await check(page, vp.name, name, path, !process.env.QA_NOSHOT));
  await ctx.close();
}

// ───── report ─────
let bad = 0;
console.log(`\n${"viewport".padEnd(8)} ${"page".padEnd(14)} status  ms    overflow  problems`);
for (const r of rows) {
  const problems = [...(r.overflow > 1 ? [`OVERFLOW ${r.overflow}px`] : []), ...r.errors.map((e) => `console: ${e}`), ...r.axe.map((a) => `a11y: ${a}`)];
  const expected404 = r.page === "not-found" && r.status === 404;
  const flag = (r.status !== 200 && !expected404) || problems.length > 0;
  if (flag) bad++;
  console.log(`${r.vp.padEnd(8)} ${r.page.padEnd(14)} ${String(r.status).padEnd(7)} ${String(r.ms).padEnd(5)} ${String(r.overflow).padEnd(9)} ${flag ? problems.join(" | ") || "bad status" : "ok"}`);
}
console.log(`\n${rows.length} page loads, ${bad} with problems. Screenshots in ${OUT}/`);
await browser.close();
process.exit(bad ? 1 : 0);
