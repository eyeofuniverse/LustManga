// Phase 0 source probe: plain GET requests only. Reports reachability, bot-wall
// markers, and basic response shape per candidate site. Writes probe-results.json.
import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const SITES = [
  { name: "mangadex-api", kind: "manga", url: "https://api.mangadex.org/ping" },
  { name: "nhentai", kind: "doujin", url: "https://nhentai.net/" },
  { name: "nhentai-api", kind: "doujin", url: "https://nhentai.net/api/galleries/search?query=language:english&page=1" },
  { name: "e-hentai", kind: "doujin", url: "https://e-hentai.org/" },
  { name: "hitomi", kind: "doujin", url: "https://hitomi.la/" },
  { name: "hitomi-index", kind: "doujin", url: "https://ltn.gold-usergeneratedcontent.net/index-english.nozomi", headers: { Range: "bytes=0-99" } },
  { name: "hentaifox", kind: "doujin", url: "https://hentaifox.com/" },
  { name: "hentai2read", kind: "both", url: "https://hentai2read.com/" },
  { name: "3hentai", kind: "doujin", url: "https://3hentai.net/" },
  { name: "asmhentai", kind: "doujin", url: "https://asmhentai.com/" },
  { name: "pururin", kind: "doujin", url: "https://pururin.to/" },
  { name: "hentaiera", kind: "doujin", url: "https://hentaiera.com/" },
  { name: "imhentai", kind: "doujin", url: "https://imhentai.xxx/" },
  { name: "simplyhentai", kind: "both", url: "https://www.simply-hentai.com/" },
  { name: "doujins", kind: "doujin", url: "https://doujins.com/" },
  { name: "nhentai-xxx", kind: "doujin", url: "https://nhentai.xxx/" },
];

const BOT_MARKERS = [
  [/just a moment/i, "cloudflare-challenge"],
  [/cf-browser-verification|cf_chl_opt|challenge-platform/i, "cloudflare-js-challenge"],
  [/attention required/i, "cloudflare-block"],
  [/ddos-guard/i, "ddos-guard"],
  [/captcha/i, "captcha"],
  [/access denied/i, "access-denied"],
];

async function probe(s) {
  const t0 = Date.now();
  const out = { name: s.name, kind: s.kind, url: s.url };
  try {
    const res = await fetch(s.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": UA, accept: "text/html,application/json,*/*", ...(s.headers ?? {}) },
    });
    const body = (await res.text()).slice(0, 200_000);
    out.status = res.status;
    out.finalUrl = res.url === s.url ? undefined : res.url;
    out.ms = Date.now() - t0;
    out.server = res.headers.get("server");
    out.cfRay = !!res.headers.get("cf-ray");
    out.cfMitigated = res.headers.get("cf-mitigated") || undefined;
    out.contentType = res.headers.get("content-type");
    out.bytes = body.length;
    out.botMarkers = BOT_MARKERS.filter(([re]) => re.test(body)).map(([, n]) => n);
    out.hasGalleryLinks = /\/(g|gallery|galleries|manga|reader|view|posts?)\/[\w-]+/i.test(body);
    out.looksJson = /^\s*[\[{]/.test(body);
  } catch (e) {
    out.error = `${e.cause?.code ?? e.name}: ${e.message}`;
    out.ms = Date.now() - t0;
  }
  return out;
}

// MangaDex: official API — check the adult-rated listing and the at-home image server shape.
async function mangadexDeep() {
  const r = {};
  try {
    const list = await fetch(
      "https://api.mangadex.org/manga?limit=1&contentRating[]=pornographic&order[followedCount]=desc&includes[]=cover_art",
      { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) },
    );
    const j = await list.json();
    r.listStatus = list.status;
    r.totalPornographic = j.total;
    r.rateLimitHeaders = {
      limit: list.headers.get("x-ratelimit-limit"),
      remaining: list.headers.get("x-ratelimit-remaining"),
    };
    const id = j.data?.[0]?.id;
    if (id) {
      const feed = await fetch(
        `https://api.mangadex.org/manga/${id}/feed?limit=1&contentRating[]=pornographic&translatedLanguage[]=en&includeExternalUrl=0`,
        { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) },
      );
      const fj = await feed.json();
      r.feedStatus = feed.status;
      r.feedTotal = fj.total;
      const ch = fj.data?.[0]?.id;
      if (ch) {
        const ah = await fetch(`https://api.mangadex.org/at-home/server/${ch}`, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(20_000),
        });
        const aj = await ah.json();
        r.atHomeStatus = ah.status;
        r.atHomeShape = aj.chapter ? { pages: aj.chapter.data?.length, saverPages: aj.chapter.dataSaver?.length, baseUrlHost: new URL(aj.baseUrl).host } : aj;
        const first = aj.chapter?.data?.[0];
        if (first) {
          const img = await fetch(`${aj.baseUrl}/data/${aj.chapter.hash}/${first}`, {
            headers: { "user-agent": UA },
            signal: AbortSignal.timeout(30_000),
          });
          const buf = await img.arrayBuffer();
          r.imageFetch = { status: img.status, bytes: buf.byteLength, contentType: img.headers.get("content-type") };
        }
      }
    }
  } catch (e) {
    r.error = `${e.cause?.code ?? e.name}: ${e.message}`;
  }
  return r;
}

const results = [];
for (const s of SITES) {
  const r = await probe(s);
  results.push(r);
  console.log(
    r.error
      ? `${r.name.padEnd(14)} ERROR ${r.error}`
      : `${r.name.padEnd(14)} ${r.status} ${String(r.ms).padStart(5)}ms cf=${r.cfRay} mit=${r.cfMitigated ?? "-"} bot=[${r.botMarkers.join(",")}] json=${r.looksJson} links=${r.hasGalleryLinks}${r.finalUrl ? " -> " + r.finalUrl : ""}`,
  );
  await new Promise((r) => setTimeout(r, 1500));
}

console.log("\n== mangadex deep ==");
const md = await mangadexDeep();
console.log(JSON.stringify(md, null, 2));

writeFileSync(new URL("./probe-results.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), results, mangadex: md }, null, 2));
