// SEO audit against a running site, the way a crawler sees it: head tags, indexing rules, structured data,
// sitemaps, robots, icons, share cards and redirects.
//   NEXT_PUBLIC_SITE_URL=http://localhost:3200 npx next build && npx next start -p 3200
//   BASE_URL=http://localhost:3200 npm run seo
// The build must have been made with NEXT_PUBLIC_SITE_URL equal to BASE_URL, so canonical tags point back at it.
import sharp from "sharp";

const BASE = (process.env.BASE_URL ?? "http://localhost:3200").replace(/\/$/, "");
const SERIES = process.env.QA_SERIES ?? "74";
const UNICODE_WORK = process.env.QA_UNICODE ?? "115";
const TAG = process.env.QA_TAG ?? "big-breasts";
const HEADERS = { cookie: "lm_age=1" };

const results: [boolean, string][] = [];
const ok = (cond: boolean, name: string, extra = "") => {
  results.push([cond, name]);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? `  [${extra}]` : ""}`);
};

interface Page {
  url: string;
  status: number;
  location: string | null;
  html: string;
  headers: Headers;
}
async function get(path: string, init: RequestInit = {}): Promise<Page> {
  const r = await fetch(path.startsWith("http") ? path : BASE + path, { headers: HEADERS, redirect: "manual", ...init });
  return { url: path, status: r.status, location: r.headers.get("location"), html: r.status < 300 || r.status >= 400 ? await r.text() : "", headers: r.headers };
}

const all = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const meta = (html: string, attr: "name" | "property", key: string) => {
  const m = html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`));
  return m ? decode(m[1]) : null;
};
const info = (html: string) => ({
  title: decode(html.match(/<title>(.*?)<\/title>/s)?.[1] ?? ""),
  description: meta(html, "name", "description"),
  canonicals: all(html, /<link rel="canonical" href="([^"]*)"/g).map(decode),
  robots: meta(html, "name", "robots"),
  h1: all(html, /<h1[^>]*>(.*?)<\/h1>/gs).map((s) => decode(s.replace(/<[^>]+>/g, "").trim())),
  ogTitle: meta(html, "property", "og:title"),
  ogDescription: meta(html, "property", "og:description"),
  ogImage: meta(html, "property", "og:image"),
  ogUrl: meta(html, "property", "og:url"),
  ogType: meta(html, "property", "og:type"),
  twitterCard: meta(html, "name", "twitter:card"),
  twitterImage: meta(html, "name", "twitter:image"),
  lang: html.match(/<html lang="([^"]*)"/)?.[1],
  hreflang: [...html.matchAll(/<link rel="alternate" hrefLang="([^"]*)" href="([^"]*)"/g)].map((m) => [m[1], m[2]] as [string, string]),
  ld: all(html, /<script type="application\/ld\+json">(.*?)<\/script>/gs).flatMap((s) => {
    try {
      const j = JSON.parse(s);
      return Array.isArray(j) ? j : [j];
    } catch {
      return [{ "@type": "INVALID" }];
    }
  }) as { "@type": string; [k: string]: unknown }[],
  imgsWithoutAlt: (html.match(/<img(?![^>]*\balt=)[^>]*>/g) ?? []).length,
});
const types = (p: ReturnType<typeof info>) => p.ld.map((x) => x["@type"]);
const noindex = (p: ReturnType<typeof info>) => /noindex/.test(p.robots ?? "");

/* ───────────────── 1. every indexable page type ───────────────── */
const seen = new Map<string, string>(); // title -> url, for duplicate detection
async function indexable(label: string, path: string, opts: { ld?: string[]; selfCanonical?: string; h1?: boolean } = {}) {
  const pg = await get(path);
  const p = info(pg.html);
  ok(pg.status === 200, `${label}: 200`, String(pg.status));
  if (pg.status !== 200) return p;
  ok(p.title.length >= 15 && p.title.length <= 92, `${label}: title length ${p.title.length}`, p.title);
  ok(!!p.description && p.description.length >= 70 && p.description.length <= 170, `${label}: description length ${p.description?.length}`, p.description ?? "missing");
  ok(p.canonicals.length === 1 && p.canonicals[0].startsWith(BASE), `${label}: exactly one canonical on this site`, p.canonicals.join(" | "));
  if (opts.selfCanonical) ok(p.canonicals[0] === BASE + opts.selfCanonical, `${label}: canonical is ${opts.selfCanonical}`, p.canonicals[0]);
  ok(!noindex(p), `${label}: indexable`, p.robots ?? "");
  ok(p.h1.length === 1, `${label}: exactly one h1`, p.h1.join(" | "));
  ok(!!p.ogTitle && !!p.ogDescription && !!p.ogImage && !!p.ogUrl && p.twitterCard === "summary_large_image" && !!p.twitterImage, `${label}: complete social card`, JSON.stringify({ t: !!p.ogTitle, d: !!p.ogDescription, i: !!p.ogImage, u: p.ogUrl, c: p.twitterCard, ti: !!p.twitterImage }));
  ok(!p.ogUrl || p.ogUrl.startsWith(BASE) || p.ogUrl.startsWith("/"), `${label}: og:url belongs to this site`, p.ogUrl ?? "");
  ok(p.lang === "en", `${label}: html lang`);
  ok(p.imgsWithoutAlt === 0, `${label}: every image has alt text`, String(p.imgsWithoutAlt));
  for (const t of opts.ld ?? []) ok(types(p).includes(t), `${label}: structured data includes ${t}`, types(p).join(","));
  ok(!types(p).includes("INVALID"), `${label}: structured data is valid JSON`);
  const prior = seen.get(p.title);
  ok(!prior, `${label}: title is unique`, prior ? `same as ${prior}` : "");
  seen.set(p.title, path);
  return p;
}

const work = await get(`/g/${SERIES}`);
const workPath = work.location ?? `/g/${SERIES}`;
const workUnicodePath = (await get(`/g/${UNICODE_WORK}`)).location ?? `/g/${UNICODE_WORK}`;

const home = await indexable("home", "/", { ld: ["Organization", "WebSite", "FAQPage"], selfCanonical: "" });
const ws = home.ld.find((x) => x["@type"] === "WebSite") as { potentialAction?: { target?: { urlTemplate?: string } } } | undefined;
ok(!!ws?.potentialAction?.target?.urlTemplate?.includes("{search_term_string}"), "home: WebSite has a SearchAction");
await indexable("browse", "/browse", { ld: ["BreadcrumbList", "ItemList"], selfCanonical: "/browse" });
await indexable("browse page 2", "/browse?page=2", { selfCanonical: "/browse?page=2" });
await indexable("tags", "/tags", { selfCanonical: "/tags" });
await indexable("artists", "/artists", { selfCanonical: "/artists" });
await indexable("groups", "/groups", { selfCanonical: "/groups" });
await indexable("parodies", "/parodies", { selfCanonical: "/parodies" });
await indexable("characters", "/characters", { selfCanonical: "/characters" });
await indexable("search help", "/search/help", { selfCanonical: "/search/help" });
for (const p of ["dmca", "2257", "privacy", "terms"]) await indexable(p, `/${p}`, { selfCanonical: `/${p}` });
await indexable("tag", `/tag/${TAG}`, { ld: ["BreadcrumbList", "ItemList"], selfCanonical: `/tag/${TAG}` });
await indexable("tag page 2", `/tag/${TAG}?page=2`, { selfCanonical: `/tag/${TAG}?page=2` });
await indexable("category", "/category/doujinshi", { ld: ["BreadcrumbList"], selfCanonical: "/category/doujinshi" });
const w = await indexable("work", workPath, { ld: ["BreadcrumbList"] });
const wld = w.ld.find((x) => x["@type"] === "Book" || x["@type"] === "ComicSeries") as Record<string, unknown> | undefined;
ok(!!wld, "work: Book or ComicSeries structured data", types(w).join(","));
ok(!!wld && !!wld.name && !!wld.url && !!wld.inLanguage && wld.isFamilyFriendly === false && wld.contentRating === "adult", "work: structured data has name, url, language and the adult rating");
ok(w.title.length <= 92 && /Read .* Online/.test(w.title), "work: title says what it is", w.title);
ok(w.ogType === "book", "work: og:type is book", w.ogType ?? "");
ok(w.canonicals[0] === BASE + workPath, "work: canonical is its own address", w.canonicals[0]);
const uw = await indexable("work (non-ASCII title)", workUnicodePath);
ok(/^https?:\/\/[\x21-\x7e]+$/.test(uw.canonicals[0] ?? ""), "work (non-ASCII title): canonical is a valid ASCII URL", uw.canonicals[0] ?? "");
ok(/^[\x21-\x7e]+$/.test(workUnicodePath), "work (non-ASCII title): redirect target is a valid ASCII URL", workUnicodePath);

/* ───────────────── 2. pages that must NOT be indexed ───────────────── */
const mustNot: [string, string, string?][] = [
  ["search results", "/search?q=school"],
  ["sorted list", "/browse?sort=new", "/browse"],
  ["language-filtered list", "/browse?lang=ja", "/browse"],
  ["category-filtered list", "/browse?cat=MANGA", "/browse"],
  ["A-Z letter page", "/tags?letter=A", "/tags"],
  ["directory search", "/tags?q=big", "/tags"],
  ["tag list, sorted", `/tag/${TAG}?sort=new`, `/tag/${TAG}`],
  ["a page far down a list", "/browse?page=40"],
  ["reader", `/read/${SERIES}/1`],
  ["favorites", "/favorites"],
  ["following", "/following"],
  ["history", "/history"],
  ["settings", "/settings"],
  ["report form", "/report-content"],
];
for (const [label, path, canonical] of mustNot) {
  const pg = await get(path);
  if (pg.status >= 300 && pg.status < 400) {
    ok(true, `${label}: redirects instead of being indexed (${pg.status})`);
    continue;
  }
  const p = info(pg.html);
  ok(noindex(p), `${label}: noindex`, p.robots ?? "no robots tag");
  if (canonical) ok(p.canonicals[0] === BASE + canonical, `${label}: canonical folds into ${canonical}`, p.canonicals[0] ?? "none");
}
const missing = await get("/g/99999999");
ok(missing.status === 404, "a missing work is a real 404", String(missing.status));
ok(noindex(info(missing.html)), "...and the 404 page is noindex");
ok((await get("/tag/this-tag-does-not-exist")).status === 404, "a missing tag is a real 404");

/* ───────────────── 3. translations ───────────────── */
{
  // find a work that has translations and check the links are reciprocal and point at real pages
  const cand = ["74", "51", "1331", "323"];
  let found = false;
  for (const id of cand) {
    const loc = (await get(`/g/${id}`)).location;
    if (!loc) continue;
    const pg = info((await get(loc)).html);
    if (pg.hreflang.length < 2) continue;
    found = true;
    const map = new Map(pg.hreflang.map(([l, h]) => [l, decode(h)]));
    ok(map.size >= 2 && [...map.values()].some((h) => h.endsWith(loc)), `hreflang: ${loc.slice(0, 40)} lists itself and its translations`, [...map.keys()].join(","));
    const other = [...map.entries()].find(([, h]) => !h.endsWith(loc));
    if (other) {
      const back = info((await get(new URL(other[1]).pathname)).html);
      ok(back.hreflang.some(([, h]) => decode(h).endsWith(loc)), "hreflang: the translation links back (reciprocal)", other[1]);
    }
    break;
  }
  if (!found) console.log("skip  hreflang: none of the sample works has a translation to check");
}

/* ───────────────── 4. robots.txt ───────────────── */
{
  const r = await get("/robots.txt");
  ok(r.status === 200, "robots.txt: 200");
  ok(r.html.includes(`Sitemap: ${BASE}/sitemap.xml`), "robots.txt: points at the sitemap index", r.html.split("\n").filter((l) => /sitemap/i.test(l)).join(" | "));
  ok(!/Disallow:\s*\/read\/?\s*$/m.test(r.html), "robots.txt: the reader is not blocked (it must be crawlable to be seen as noindex)");
  ok(!/Disallow:\s*\/search\s*$/m.test(r.html) && /Disallow:\s*\/search\?/.test(r.html), "robots.txt: search results blocked but /search/help allowed");
  ok(/Disallow:\s*\/api\//.test(r.html), "robots.txt: /api/ blocked");
  ok(!/console/i.test(r.html), "robots.txt: does not advertise the console");
}

/* ───────────────── 5. sitemaps ───────────────── */
const sitemapUrls: string[] = [];
{
  const idx = await get("/sitemap.xml");
  ok(idx.status === 200 && /xml/.test(idx.headers.get("content-type") ?? ""), "sitemap.xml: 200 as XML", `${idx.status} ${idx.headers.get("content-type")}`);
  const children = all(idx.html, /<loc>([^<]*)<\/loc>/g).map(decode);
  ok(children.length >= 2 && children.every((c) => c.startsWith(`${BASE}/sitemap/`)), `sitemap.xml: index lists ${children.length} child files on this site`, children.join(" "));
  for (const c of children) {
    const pg = await get(new URL(c).pathname);
    const urls = all(pg.html, /<url><loc>([^<]*)<\/loc>/g).map(decode);
    ok(pg.status === 200 && urls.length > 0 && urls.length <= 50_000, `${new URL(c).pathname}: ${urls.length} URLs`, String(pg.status));
    ok(pg.html.startsWith("<?xml") && pg.html.trimEnd().endsWith("</urlset>"), `${new URL(c).pathname}: well-formed`);
    sitemapUrls.push(...urls);
  }
  const unique = new Set(sitemapUrls);
  ok(unique.size === sitemapUrls.length, "sitemaps: no URL listed twice", `${sitemapUrls.length - unique.size} duplicates`);
  ok(sitemapUrls.every((u) => u.startsWith(BASE + "/")), "sitemaps: every URL is on this site");
  ok(sitemapUrls.every((u) => /^[\x21-\x7e]+$/.test(u)), "sitemaps: every URL is valid ASCII (percent-encoded)", sitemapUrls.find((u) => !/^[\x21-\x7e]+$/.test(u)) ?? "");
  ok(!sitemapUrls.some((u) => /%25[0-9A-F]{2}/i.test(u)), "sitemaps: nothing is double-encoded", sitemapUrls.find((u) => /%25[0-9A-F]{2}/i.test(u)) ?? "");
  ok(!sitemapUrls.some((u) => /\/(read|random|api|console|favorites|history|settings)(\/|\?|$)|\/search(\?|$)/.test(u)), "sitemaps: no blocked or noindex pages");
  ok(sitemapUrls.includes(BASE + "/") || sitemapUrls.includes(BASE), "sitemaps: the home page is listed");
  ok(sitemapUrls.some((u) => u.includes("/g/")), "sitemaps: works are listed");
  const flat = await get("/sitemap-flat.xml");
  const flatUrls = all(flat.html, /<url><loc>([^<]*)<\/loc>/g).map(decode);
  ok(flat.status === 200 && flatUrls.length === sitemapUrls.length, "sitemap-flat.xml: one file with every URL the index lists", `${flat.status} ${flatUrls.length} vs ${sitemapUrls.length}`);
  ok((await get("/sitemap/9999.xml")).status === 404, "sitemaps: an unknown child file is a 404");
  ok((await get("/sitemap/abc.xml")).status === 404, "sitemaps: a malformed child name is a 404");
}

/* ───────────────── 6. what the sitemap promises is true ───────────────── */
{
  // a spread of URLs from the sitemap, plus the first few of each kind: every one must load, be indexable and name itself as canonical
  const works = sitemapUrls.filter((u) => u.includes("/g/"));
  const tags = sitemapUrls.filter((u) => /\/(tag|artist|group|parody|character|category|language)\//.test(u));
  const pick = (list: string[], n: number) => [...new Set([...list.slice(0, 3), ...Array.from({ length: n }, (_, i) => list[Math.floor(((i + 1) * list.length) / (n + 1))])])].filter(Boolean);
  const sample = [...pick(works, 12), ...pick(tags, 8)];
  let bad = 0;
  const problems: string[] = [];
  for (const u of sample) {
    const path = new URL(u).pathname + new URL(u).search;
    const pg = await get(path);
    const p = info(pg.html);
    const selfOk = p.canonicals[0] === u;
    if (pg.status !== 200 || noindex(p) || !selfOk) {
      bad++;
      problems.push(`${path} -> ${pg.status} robots=${p.robots} canonical=${p.canonicals[0]}`);
    }
  }
  ok(bad === 0, `sitemap spot-check: ${sample.length} listed URLs all load, are indexable and are their own canonical`, problems.slice(0, 3).join(" | "));
}

/* ───────────────── 7. icons, manifest, IndexNow, share cards ───────────────── */
{
  for (const [path, type] of [["/favicon.ico", /icon/], ["/icon.png", /png/], ["/apple-icon.png", /png/], ["/maskable-icon.png", /png/]] as const) {
    const r = await fetch(BASE + path);
    const buf = Buffer.from(await r.arrayBuffer());
    ok(r.status === 200 && type.test(r.headers.get("content-type") ?? "") && buf.length > 200, `${path}: served`, `${r.status} ${r.headers.get("content-type")} ${buf.length}B`);
  }
  const ico = Buffer.from(await (await fetch(BASE + "/favicon.ico")).arrayBuffer());
  ok(ico.readUInt16LE(2) === 1 && ico.readUInt8(6) % 48 === 0, "favicon.ico: a real icon file at a multiple of 48px (what Google asks for)", `type=${ico.readUInt16LE(2)} width=${ico.readUInt8(6)}`);
  const mf = await get("/manifest.webmanifest");
  const m = JSON.parse(mf.html || "{}") as { name?: string; icons?: { src: string }[]; start_url?: string; display?: string };
  ok(mf.status === 200 && !!m.name && m.start_url === "/" && (m.icons?.length ?? 0) >= 2, "manifest.webmanifest: valid with icons", mf.html.slice(0, 80));
  for (const i of m.icons ?? []) ok((await fetch(BASE + i.src)).status === 200, `manifest icon ${i.src} exists`);

  const key = (await import("../src/lib/indexnow")).INDEXNOW_KEY;
  const kf = await get(`/${key}.txt`);
  ok(kf.status === 200 && kf.html.trim() === key, "IndexNow: the key file is served and matches", `${kf.status} ${kf.html.slice(0, 40)}`);

  for (const [label, img] of [["home", home.ogImage], ["work", w.ogImage], ["work (non-ASCII title)", uw.ogImage]] as const) {
    if (!img) {
      ok(false, `${label}: share card exists`);
      continue;
    }
    const r = await fetch(img.replace(/^https?:\/\/[^/]+/, BASE));
    const buf = Buffer.from(await r.arrayBuffer());
    const meta = r.ok ? await sharp(buf).metadata().catch(() => null) : null;
    ok(r.status === 200 && meta?.width === 1200 && meta?.height === 630 && /png/.test(r.headers.get("content-type") ?? ""), `${label}: share card is a 1200x630 PNG`, `${r.status} ${meta?.width}x${meta?.height} ${buf.length}B`);
    ok(buf.length > 15_000, `${label}: share card has real content (${Math.round(buf.length / 1024)} KB)`);
  }
}

/* ───────────────── 8. redirects and headers ───────────────── */
{
  const r = await get(`/g/${SERIES}`);
  ok(r.status === 308 && /^\/g\/\d+-[\x21-\x7e]+$/.test(r.location ?? ""), "a bare work id redirects permanently to its canonical address", `${r.status} ${r.location}`);
  const wrongSlug = await get(`/g/${SERIES}-not-the-real-slug`);
  ok(wrongSlug.status === 308 && wrongSlug.location === r.location, "a wrong slug redirects permanently to the real one", `${wrongSlug.status} ${wrongSlug.location}`);
  ok((await get("/browse/")).status === 308, "a trailing slash redirects instead of duplicating the page");
  const hdr = (await get("/")).headers;
  ok(!/noindex/i.test(hdr.get("x-robots-tag") ?? ""), "production pages carry no noindex header");
  ok((hdr.get("strict-transport-security") ?? "").includes("max-age"), "HSTS header");
  ok(!!hdr.get("x-content-type-options") && !!hdr.get("referrer-policy"), "security headers");
}

/* ───────────────── 9. internal links on the home page all resolve ───────────────── */
{
  const links = [...new Set(all((await get("/")).html, /<a [^>]*href="(\/[^"#]*)"/g).map(decode))].filter((h) => !h.startsWith("/random") && !h.startsWith("/api/") && !h.startsWith("/console")).slice(0, 60);
  const dead: string[] = [];
  for (const l of links) {
    const s = (await get(l)).status;
    if (s >= 400) dead.push(`${l} -> ${s}`);
  }
  ok(dead.length === 0, `${links.length} internal links on the home page: none is broken`, dead.join(" | "));
}

/* ───────────────── 10. what a crawler sees: no cookies, so the age gate is in the page ───────────────── */
{
  const bot = { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" };
  for (const [label, path] of [["home", "/"], ["browse", "/browse"], ["tag", `/tag/${TAG}`], ["work", workPath], ["work (non-ASCII title)", workUnicodePath]] as const) {
    const r = await fetch(BASE + path, { headers: bot, redirect: "manual" });
    const html = await r.text();
    const p = info(html);
    const withCookie = info((await get(path)).html);
    ok(r.status === 200, `crawler, ${label}: 200 with no cookies`, String(r.status));
    ok(html.includes('role="dialog"') && html.includes("Adults only"), `crawler, ${label}: the age gate is shown (and that is fine for search engines)`);
    ok(p.h1.length === 1, `crawler, ${label}: still exactly one h1 (the age gate does not add one)`, p.h1.join(" | "));
    ok(p.title === withCookie.title && p.canonicals[0] === withCookie.canonicals[0] && p.description === withCookie.description, `crawler, ${label}: same title, description and canonical as a visitor`);
    ok(!noindex(p) && JSON.stringify(types(p)) === JSON.stringify(types(withCookie)), `crawler, ${label}: indexable, same structured data`);
    ok(html.includes(">" + (path === "/" ? "Read hentai manga" : p.h1[0].slice(0, 12))), `crawler, ${label}: the real content is in the HTML`, p.h1[0] ?? "");
  }
}

/* ───────────────── 10b. share cards for every kind of title ───────────────── */
{
  // Korean, Cyrillic and Arabic titles: the card must render (a font for the first two, a plain label for the last), never fail
  for (const [label, id] of [["Korean", "929"], ["Cyrillic", "171"], ["Arabic", "13"]] as const) {
    const loc = (await get(`/g/${id}`)).location;
    if (!loc) {
      console.log(`skip  ${label} title: work ${id} is not published here`);
      continue;
    }
    const img = info((await get(loc)).html).ogImage;
    const r = img ? await fetch(img.replace(/^https?:\/\/[^/]+/, BASE)) : null;
    const buf = r ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
    const m = r?.ok ? await sharp(buf).metadata().catch(() => null) : null;
    ok(!!r && r.status === 200 && m?.width === 1200 && m?.height === 630, `${label} title: share card renders at 1200x630`, `${r?.status} ${m?.width}x${m?.height}`);
  }
}

/* ───────────────── 10c. the XML is really well-formed (a browser's parser, not a regex) ───────────────── */
{
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");
  const files = ["/sitemap.xml", "/sitemap-flat.xml", "/feed.xml", "/opensearch.xml", ...Array.from({ length: 4 }, (_, i) => `/sitemap/${i}.xml`)];
  for (const f of files) {
    const r = await fetch(BASE + f);
    if (r.status === 404) continue; // a child file that does not exist for a catalogue this small
    const xml = await r.text();
    const err = await page.evaluate((x) => {
      const doc = new DOMParser().parseFromString(x, "application/xml");
      return doc.querySelector("parsererror")?.textContent?.slice(0, 160) ?? "";
    }, xml);
    ok(r.status === 200 && err === "", `${f}: parses as XML`, err || String(r.status));
  }
  await browser.close();
}

/* ───────────────── 10d. sitemap dates are honest ───────────────── */
{
  const child = sitemapUrls.length ? await get("/sitemap/" + ((await get("/sitemap.xml")).html.match(/\/sitemap\/(\d+)\.xml/g)!.length - 1) + ".xml") : null;
  const dates = child ? all(child.html, /<lastmod>([^<]*)<\/lastmod>/g) : [];
  const now = Date.now();
  ok(dates.length > 0 && dates.every((d) => !Number.isNaN(Date.parse(d)) && Date.parse(d) <= now + 60_000), `sitemap lastmod: ${dates.length} dates, all valid and none in the future`);
  ok(new Set(dates.map((d) => d.slice(0, 10))).size > 1 || dates.length < 20, "sitemap lastmod: not one identical date on every URL (that tells Google it is meaningless)", `${new Set(dates.map((d) => d.slice(0, 10))).size} distinct days`);
}

/* ───────────────── 11. feeds ───────────────── */
{
  const rss = await get("/feed.xml");
  const items = (rss.html.match(/<item>/g) ?? []).length;
  ok(rss.status === 200 && /rss\+xml/.test(rss.headers.get("content-type") ?? "") && items >= 10, `feed.xml: RSS with ${items} newest works`, `${rss.status} ${rss.headers.get("content-type")}`);
  ok(all(rss.html, /<link>([^<]*)<\/link>/g).every((l) => l.startsWith(BASE)), "feed.xml: every link is on this site");
  const os = await get("/opensearch.xml");
  ok(os.status === 200 && os.html.includes("{searchTerms}") && os.html.includes(`${BASE}/search?q=`), "opensearch.xml: lets browsers add site search");
  const h = (await get("/")).html;
  ok(/rel="search"[^>]*opensearchdescription/.test(h) || /opensearchdescription[^>]*rel="search"/.test(h), "home: advertises the OpenSearch description");
  ok(/rel="alternate"[^>]*type="application\/rss\+xml"/.test(h) || /type="application\/rss\+xml"[^>]*rel="alternate"/.test(h), "home: advertises the RSS feed");
}

/* ───────────────── 12. keywords, one brand, clean links and titles ───────────────── */
{
  const h = await get("/");
  const p = info(h.html);
  ok(/hentai/i.test(p.title), "home: the title carries the term people search for", p.title);
  ok(/hentai/i.test(p.h1.join(" ")), "home: the h1 carries it too", p.h1.join(" | "));
  ok(/hentai/i.test(p.description ?? ""), "home: and the description", p.description ?? "");

  // one name everywhere: the share-card site name is the same on every page, and the old name is gone
  const siteNames = new Set<string>();
  for (const path of ["/", "/browse", "/tags", "/dmca", "/privacy", `/tag/${TAG}`, "/category/doujinshi", workPath]) {
    const pg = await get(path);
    const name = meta(pg.html, "property", "og:site_name");
    if (name) siteNames.add(name);
    ok(!/LustManga/i.test(pg.html.replace(/<script[\s\S]*?<\/script>/g, "")), `${path}: the old brand name is gone`);
  }
  ok(siteNames.size === 1, `one brand name on every page (${[...siteNames].join(", ")})`);
  const brand = [...siteNames][0] ?? "";
  ok(!!brand && home.title.includes(brand) && (await get("/browse")).html.includes(`| ${brand}`), "the brand shows in the titles");

  // categories link to their clean pages, never to a /browse?cat= filter, and the duplicate spellings redirect
  ok(/href="\/category\/doujinshi"/.test(h.html) && !/href="\/browse\?cat=/.test(h.html), "home: category tiles link to /category/...");
  ok(/href="\/category\/[a-z-]+"/.test((await get(workPath)).html), "work: the breadcrumb links to /category/...");
  const dupCat = await get("/category/gamecg");
  ok(dupCat.status === 308 && dupCat.location?.endsWith("/category/game-cg") === true, "the duplicate category /category/gamecg redirects to /category/game-cg", `${dupCat.status} ${dupCat.location}`);
  const dupTag = await get("/tag/blow-job");
  ok(dupTag.status === 308 && dupTag.location?.endsWith("/tag/blowjob") === true, "the duplicate tag /tag/blow-job redirects to /tag/blowjob", `${dupTag.status} ${dupTag.location}`);

  // titles read as titles: no [Korean] / {site.com} / circle blocks, no cut-off mid-word
  const cards = [...(await get("/browse")).html.matchAll(/<h3[^>]*>(.*?)<\/h3>/gs)].map((m) => decode(m[1].replace(/<[^>]+>/g, "")));
  const messy = cards.filter((t) => /^\s*[\[(【{]|[\]}】]\s*$|\[(English|Korean|Chinese|Digital|Decensored)\]|\{[^}]*\}|\.(com|net)\b/i.test(t));
  ok(cards.length >= 20 && messy.length === 0, `browse: ${cards.length} card titles, none carrying release-name clutter`, messy.slice(0, 3).join(" | "));
  const titled = [workPath, workUnicodePath, "/", "/browse"];
  for (const path of titled) ok(!/[\p{L}\p{N}]…/u.test(info((await get(path)).html).title), `${path}: the title is not cut off mid-word`);

  // every link has a name a crawler can read, and it is not an address
  const unnamed = (html: string) =>
    [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter((m) => {
      const label = /aria-label="([^"]*)"/.exec(m[1])?.[1] ?? "";
      const alt = /<img[^>]*\balt="([^"]*)"/.exec(m[2])?.[1] ?? "";
      const text = decode(m[2].replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      const name = label || text || alt;
      return !name || /^(https?:\/\/|\/)|%[0-9A-F]{2}/i.test(name);
    }).length;
  for (const path of ["/", "/browse", workPath]) ok(unnamed((await get(path)).html) === 0, `${path}: every link has a readable name (none empty, none a raw address)`, String(unnamed((await get(path)).html)));
}

const failed = results.filter(([c]) => !c).length;
console.log(`\n${results.length - failed}/${results.length} SEO checks passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
