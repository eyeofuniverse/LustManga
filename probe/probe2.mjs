// Round 2: for sites that returned 200, check real content: listing -> gallery page -> image fetch.
// Prints counts/hosts only (no titles).
import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url, headers = {}, binary = false) => {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
    headers: { "user-agent": UA, accept: "text/html,*/*", ...headers },
  });
  if (binary) {
    const buf = await res.arrayBuffer();
    return { res, bytes: buf.byteLength, ct: res.headers.get("content-type") };
  }
  return { res, text: await res.text() };
};

const hrefs = (html, re) => [...new Set([...html.matchAll(re)].map((m) => m[1]))];
const imgUrls = (html, base) =>
  [...new Set([...html.matchAll(/(?:data-src|src|data-original)=["']([^"']+\.(?:jpe?g|png|webp|avif|gif)[^"']*)["']/gi)].map((m) => {
    try { return new URL(m[1], base).href; } catch { return null; }
  }).filter(Boolean))];

const SITES = [
  { name: "e-hentai", home: "https://e-hentai.org/", gal: /href="(https:\/\/e-hentai\.org\/g\/\d+\/[a-f0-9]+\/)"/g },
  { name: "hentaifox", home: "https://hentaifox.com/", gal: /href="(\/gallery\/\d+\/)"/g },
  { name: "3hentai", home: "https://3hentai.net/", gal: /href="(\/d\/\d+)"/g },
  { name: "hentai2read", home: "https://hentai2read.com/", gal: /href="(https:\/\/hentai2read\.com\/[\w-]+\/)"/g },
  { name: "asmhentai", home: "https://asmhentai.com/", gal: /href="(\/gallery\/\d+\/)"/g },
  { name: "hentaiera", home: "https://hentaiera.com/", gal: /href="(\/gallery\/\d+\/)"/g },
  { name: "nhentai-xxx", home: "https://nhentai.xxx/", gal: /href="(\/g\/\d+\/)"/g },
];

const out = [];
for (const s of SITES) {
  const r = { name: s.name };
  try {
    const home = await get(s.home);
    r.homeStatus = home.res.status;
    const links = hrefs(home.text, s.gal);
    r.galleryLinksOnHome = links.length;
    r.homeTitleSnippet = (home.text.match(/<title>([^<]{0,60})/i) || [])[1];
    if (links.length) {
      await sleep(1500);
      const galUrl = new URL(links[Math.min(2, links.length - 1)], s.home).href;
      const g = await get(galUrl, { referer: s.home });
      r.galleryStatus = g.res.status;
      const imgs = imgUrls(g.text, galUrl);
      r.galleryImgCount = imgs.length;
      r.imgHosts = [...new Set(imgs.map((u) => new URL(u).host))].slice(0, 6);
      r.galleryTags = (g.text.match(/\/(tag|artist|parody|group|character|language)\/[\w-]+/gi) || []).length;
      const cand = imgs.find((u) => /\/(\d+|\w+)\.(jpe?g|png|webp)/i.test(u)) || imgs[imgs.length - 1];
      if (cand) {
        await sleep(1000);
        const withRef = await get(cand, { referer: galUrl, accept: "image/*" }, true);
        r.imageWithReferer = { status: withRef.res.status, bytes: withRef.bytes, ct: withRef.ct };
        await sleep(800);
        const noRef = await get(cand, { accept: "image/*" }, true);
        r.imageNoReferer = { status: noRef.res.status, bytes: noRef.bytes, ct: noRef.ct };
      }
    }
  } catch (e) {
    r.error = `${e.cause?.code ?? e.name}: ${e.message}`;
  }
  out.push(r);
  console.log(JSON.stringify(r));
  await sleep(1500);
}

// hitomi: static nozomi index + gallery JS
const h = {};
try {
  const idx = await fetch("https://ltn.gold-usergeneratedcontent.net/index-all.nozomi?x=1", {
    headers: { "user-agent": UA, range: "bytes=0-399", origin: "https://hitomi.la", referer: "https://hitomi.la/" },
    signal: AbortSignal.timeout(25_000),
  });
  const buf = new Uint8Array(await idx.arrayBuffer());
  const dv = new DataView(buf.buffer);
  const ids = [];
  for (let i = 0; i + 4 <= buf.length; i += 4) ids.push(dv.getInt32(i));
  h.indexStatus = idx.status;
  h.firstIds = ids.slice(0, 5);
  if (ids.length) {
    const gj = await fetch(`https://ltn.gold-usergeneratedcontent.net/galleries/${ids[2]}.js`, {
      headers: { "user-agent": UA, referer: "https://hitomi.la/" },
      signal: AbortSignal.timeout(25_000),
    });
    const txt = await gj.text();
    h.galleryJsStatus = gj.status;
    const json = JSON.parse(txt.replace(/^var galleryinfo\s*=\s*/, ""));
    h.galleryKeys = Object.keys(json);
    h.pageCount = json.files?.length;
    h.language = json.language;
    h.type = json.type;
    h.file0 = json.files?.[0] && { hash: json.files[0].hash, hasavif: json.files[0].hasavif, w: json.files[0].width };
    const gg = await fetch("https://ltn.gold-usergeneratedcontent.net/gg.js", { headers: { "user-agent": UA, referer: "https://hitomi.la/" }, signal: AbortSignal.timeout(25_000) });
    h.ggStatus = gg.status;
  }
} catch (e) {
  h.error = `${e.cause?.code ?? e.name}: ${e.message}`;
}
console.log("hitomi", JSON.stringify(h));
writeFileSync(new URL("./probe2-results.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), out, hitomi: h }, null, 2));
