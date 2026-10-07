// Round 3: confirm real page-image fetches (size, content-type, referer sensitivity).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const f = (url, headers = {}) =>
  fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "user-agent": UA, ...headers } });
const img = async (url, referer) => {
  try {
    const r = await f(url, { accept: "image/*", ...(referer ? { referer } : {}) });
    const b = await r.arrayBuffer();
    return { status: r.status, bytes: b.byteLength, ct: r.headers.get("content-type") };
  } catch (e) {
    return { error: `${e.cause?.code ?? e.name}` };
  }
};

// ---- hitomi: compute image URL from gg.js (subdomain + path), fetch avif/webp page
try {
  const base = "https://ltn.gold-usergeneratedcontent.net";
  const idx = await f(`${base}/index-english.nozomi`, { range: "bytes=0-39", referer: "https://hitomi.la/", origin: "https://hitomi.la" });
  const dv = new DataView(await idx.arrayBuffer());
  const id = dv.getInt32(8);
  const info = JSON.parse((await (await f(`${base}/galleries/${id}.js`, { referer: "https://hitomi.la/" })).text()).replace(/^var galleryinfo\s*=\s*/, ""));
  const gg = await (await f(`${base}/gg.js`, { referer: "https://hitomi.la/" })).text();
  const b = gg.match(/b:\s*'(\d+\/)'/)?.[1];
  const defaultO = Number(gg.match(/var o = (\d)/)?.[1] ?? 0);
  const cases = new Set([...gg.matchAll(/case (\d+):/g)].map((m) => Number(m[1])));
  const oWhenCase = Number(gg.match(/o = (\d); break;/)?.[1] ?? 1);
  const file = info.files[0];
  const h = file.hash;
  const s = parseInt(h.slice(-1) + h.slice(-3, -1), 16); // hitomi: last char + prior two chars
  const o = cases.has(s) ? oWhenCase : defaultO;
  const sub = (o ? "a" : "w") + "1"; // avif/webp subdomain letter heuristic
  const urlAvif = `https://${o ? "a" : "w"}${o + 1}.gold-usergeneratedcontent.net/${b}${s}/${h}.${file.hasavif ? "avif" : "webp"}`;
  const hit = {
    gallery: { id, language: info.language, type: info.type, pages: info.files.length },
    gg: { hasB: !!b, caseCount: cases.size },
    imageWithReferer: await img(urlAvif, "https://hitomi.la/"),
    imageNoReferer: await img(urlAvif),
  };
  console.log("hitomi", JSON.stringify(hit));
} catch (e) {
  console.log("hitomi", "ERR", e.message);
}
await sleep(1500);

// ---- hentai2read: open a chapter reader and fetch a real page image
try {
  const home = await (await f("https://hentai2read.com/")).text();
  const slug = [...home.matchAll(/href="(https:\/\/hentai2read\.com\/[\w-]+\/)"/g)].map((m) => m[1]).find((u) => !/\/(hentai-list|tag|search|login|signup)\//.test(u));
  const work = await (await f(slug)).text();
  const ch = [...work.matchAll(/href="(https:\/\/hentai2read\.com\/[\w-]+\/\d+(?:\.\d+)?\/)"/g)][0]?.[1];
  const out = { workHasChapterLink: !!ch };
  if (ch) {
    await sleep(1200);
    const rd = await (await f(ch, { referer: slug })).text();
    const data = rd.match(/'images'\s*:\s*(\[[^\]]*\])/)?.[1];
    const imgs = data ? JSON.parse(data.replace(/'/g, '"')) : [];
    out.readerImagesFound = imgs.length;
    if (imgs.length) {
      const u = "https://img1.hentaicdn.com/hentai" + imgs[0];
      out.imageWithReferer = await img(u, "https://hentai2read.com/");
      out.imageNoReferer = await img(u);
    }
  }
  console.log("hentai2read", JSON.stringify(out));
} catch (e) {
  console.log("hentai2read", "ERR", e.message);
}
await sleep(1500);

// ---- hentaiera: pick the largest-looking page image on a reader page
try {
  const home = await (await f("https://hentaiera.com/")).text();
  const gal = home.match(/href="(\/gallery\/\d+\/)"/)?.[1];
  const g = await (await f("https://hentaiera.com" + gal)).text();
  const first = g.match(/href="(\/view\/\d+\/1\/)"/)?.[1];
  const out = { hasReaderLink: !!first };
  if (first) {
    const rd = await (await f("https://hentaiera.com" + first, { referer: "https://hentaiera.com" + gal })).text();
    const u = rd.match(/(?:src|data-src)="(https?:\/\/[^"]+\/\d+\.(?:jpg|png|webp))"/)?.[1];
    out.readerImg = !!u;
    if (u) {
      out.imageWithReferer = await img(u, "https://hentaiera.com/");
      out.imageNoReferer = await img(u);
    }
  }
  console.log("hentaiera", JSON.stringify(out));
} catch (e) {
  console.log("hentaiera", "ERR", e.message);
}
await sleep(1500);

// ---- e-hentai: gallery -> first image page -> full image URL (rate limited by design)
try {
  const home = await (await f("https://e-hentai.org/")).text();
  const g = home.match(/href="(https:\/\/e-hentai\.org\/g\/\d+\/[a-f0-9]+\/)"/)?.[1];
  const gp = await (await f(g)).text();
  const first = gp.match(/href="(https:\/\/e-hentai\.org\/s\/[a-f0-9]+\/\d+-1)"/)?.[1];
  const out = { galleryFound: !!g, imagePageLink: !!first, pagesPerListPage: (gp.match(/\/s\/[a-f0-9]+\/\d+-\d+/g) || []).length };
  if (first) {
    await sleep(1500);
    const ip = await (await f(first, { referer: g })).text();
    const u = ip.match(/<img id="img" src="([^"]+)"/)?.[1];
    out.fullImageUrlFound = !!u;
    out.imageHost = u && new URL(u).host;
    out.bandwidthLimitNotice = /exceeded|image limit/i.test(ip);
    if (u) out.image = await img(u, first);
  }
  console.log("e-hentai", JSON.stringify(out));
} catch (e) {
  console.log("e-hentai", "ERR", `${e.cause?.code ?? e.message}`);
}
