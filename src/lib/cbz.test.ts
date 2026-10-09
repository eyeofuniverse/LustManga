import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { buildCbz, comicInfoXml, forDownload, pageFileName, safeFileName } from "./cbz";

test("pages are numbered so every reader sorts them in order", () => {
  assert.equal(pageFileName(0, 12, "https://cdn/w/a/b/1.webp"), "001.webp");
  assert.equal(pageFileName(11, 12, "https://cdn/w/a/b/12.webp"), "012.webp");
  assert.equal(pageFileName(0, 1500, "https://cdn/x/1.avif?r=2"), "0001.avif");
  assert.equal(pageFileName(4, 9, "https://cdn/x/noext"), "005.webp");
});

test("file names are safe everywhere", () => {
  assert.equal(safeFileName('A/B: C* "D"? <E> | F.'), "A B C D E F");
  assert.equal(safeFileName("   "), "download");
  assert.equal(safeFileName("x".repeat(300)).length, 120);
  assert.equal(safeFileName("全裸登校3番外 - Chapter 1"), "全裸登校3番外 - Chapter 1");
});

test("ComicInfo.xml carries the title, series, number and the adult rating, escaped", () => {
  const xml = comicInfoXml({ title: 'Tom & "Jerry" <1>', series: "S", number: "3.5", pageCount: 20, web: "https://x.test/g/1-a?x=1&y=2" });
  assert.ok(xml.includes("<Title>Tom &amp; &quot;Jerry&quot; &lt;1&gt;</Title>"));
  assert.ok(xml.includes("<Number>3.5</Number>"));
  assert.ok(xml.includes("<PageCount>20</PageCount>"));
  assert.ok(xml.includes("<Web>https://x.test/g/1-a?x=1&amp;y=2</Web>"));
  assert.ok(xml.includes("<AgeRating>Adults Only 18+</AgeRating>"));
  assert.ok(!comicInfoXml({ title: "t", series: "s", pageCount: 1 }).includes("<Number>"));
});

test("a download asks the CDN for a fresh copy (so it carries the CORS header)", () => {
  assert.equal(forDownload("https://cdn/w/1.webp"), "https://cdn/w/1.webp?dl=1");
  assert.equal(forDownload("https://cdn/w/1.webp?r=2"), "https://cdn/w/1.webp?r=2&dl=1");
});

test("buildCbz zips every page in order with ComicInfo.xml, and reports progress", async () => {
  const bodies: Record<string, number> = { "https://cdn/p/1.webp": 11, "https://cdn/p/2.webp": 22, "https://cdn/p/3.webp": 33 };
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input).replace(/\?dl=1$/, "");
    const n = bodies[url];
    if (!n) return new Response("nope", { status: 404 });
    // the slowest page is the first: order in the zip must follow the page order, not arrival order
    await new Promise((r) => setTimeout(r, url.endsWith("1.webp") ? 40 : 1));
    return new Response(new Uint8Array(n).fill(n), { status: 200 });
  }) as typeof fetch;
  try {
    const seen: number[] = [];
    const blob = await buildCbz({ pages: Object.keys(bodies).map((src) => ({ src })), info: { title: "T", series: "S", pageCount: 3 }, onProgress: (d) => seen.push(d), concurrency: 3 });
    assert.deepEqual(seen, [1, 2, 3]);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    assert.deepEqual(Object.keys(files), ["ComicInfo.xml", "001.webp", "002.webp", "003.webp"]);
    assert.equal(files["001.webp"].length, 11);
    assert.equal(files["003.webp"][0], 33);
    assert.ok(strFromU8(files["ComicInfo.xml"]).includes("<PageCount>3</PageCount>"));
    assert.equal(blob.type, "application/vnd.comicbook+zip");
  } finally {
    globalThis.fetch = real;
  }
});

test("one page that cannot be fetched fails the whole download instead of producing a broken file", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response("gone", { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(buildCbz({ pages: [{ src: "https://cdn/p/1.webp" }], info: { title: "T", series: "S", pageCount: 1 } }), /HTTP 404/);
  } finally {
    globalThis.fetch = real;
  }
});
