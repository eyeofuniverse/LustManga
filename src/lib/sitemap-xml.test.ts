import { test } from "node:test";
import assert from "node:assert/strict";
import { TAGS_PER_SITEMAP, WORKS_PER_SITEMAP, esc, planSitemaps, renderIndex, renderUrlset } from "./sitemap-xml";

test("the sitemap is split by type and size, with the main pages first", () => {
  assert.deepEqual(planSitemaps(0, 0).map((p) => p.kind), ["pages"]);
  const plan = planSitemaps(TAGS_PER_SITEMAP + 1, WORKS_PER_SITEMAP * 2 + 1);
  assert.deepEqual(plan.map((p) => `${p.id}:${p.kind}`), ["0:pages", "1:tags", "2:tags", "3:works", "4:works", "5:works"]);
  assert.deepEqual(plan.filter((p) => p.kind === "works").map((p) => (p as { chunk: number }).chunk), [0, 1, 2]);
  assert.equal(planSitemaps(10, 5000).length, 3); // exactly one full file of works is one file
});

test("xml values are escaped", () => {
  assert.equal(esc(`a&b<c>"d"'e'`), "a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
});

test("a urlset lists each page with its modified date and cover image", () => {
  const xml = renderUrlset([{ url: "https://x.test/g/1-a?x=1&y=2", lastmod: "2026-10-01T00:00:00.000Z", image: "https://cdn.test/c/1.webp" }, { url: "https://x.test/browse" }]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes("<loc>https://x.test/g/1-a?x=1&amp;y=2</loc>"));
  assert.ok(xml.includes("<lastmod>2026-10-01T00:00:00.000Z</lastmod>"));
  assert.ok(xml.includes("<image:image><image:loc>https://cdn.test/c/1.webp</image:loc></image:image>"));
  assert.ok(xml.includes("<url><loc>https://x.test/browse</loc></url>"));
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
});

test("the index points at every child file", () => {
  const xml = renderIndex("https://x.test", [0, 1, 2], "2026-10-08");
  assert.equal((xml.match(/<sitemap>/g) ?? []).length, 3);
  assert.ok(xml.includes("<loc>https://x.test/sitemap/2.xml</loc><lastmod>2026-10-08</lastmod>"));
});
