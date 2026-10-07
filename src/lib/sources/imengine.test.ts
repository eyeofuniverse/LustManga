import { test } from "node:test";
import assert from "node:assert/strict";
import { SITES, categoryFor, objectAt, parseGallery } from "./imengine";

const cfg = SITES.hentaifox;

/** A gallery page shaped like the real ones: nav links, hidden loader fields, g_thumb markup, tag rows, related block. */
const page = (th: string) => `
<html><body>
<ul class="nav"><li><a href="/tag/nav-only/">Nav</a></li></ul>
<input type="hidden" id="load_pages" value="3" />
<input type="hidden" id="load_dir" value="005" />
<h1>Some Title</h1>
<ul class="tags"><span class="i_text">Tags:</span>
  <li><a class='tag_btn ' href='/tag/blowjob/'>blowjob <span class='t_badge'>33482</span></a></li>
  <li><a class='tag_btn ' href='/tag/big-breasts/'>big breasts <span class='t_badge'>9</span></a></li>
</ul>
<ul class="artists"><li><a class='tag_btn' href='/artist/foo-bar/'>foo bar <span class='t_badge'>3</span></a></li></ul>
<ul class="parodies"><li><a class='tag_btn' href='/parody/original/'>original</a></li><li><a class='tag_btn' href='/parody/some-show/'>some show</a></li></ul>
<ul class="languages"><li><a class='tag_btn' href='/language/english/'>english</a></li><li><a class='tag_btn' href='/language/translated/'>translated</a></li></ul>
<ul class="category"><li><a class='tag_btn' href='/category/doujinshi/'>doujinshi</a></li></ul>
<div class="g_thumb"><a href="/g/1/1/"><img data-src="https://i3.example.com/005/abc123/1t.jpg"></a></div>
<script>var g_th = $.parseJSON('${th}');</script>
<div class="related"><a href="/tag/related-only/">Related tag</a></div>
</body></html>`;

test("images come from the page-type table: webp / jpg / gif per page", () => {
  const g = parseGallery(cfg, "1", page('{"1":"w,100,100","2":"j,100,100","3":"g,100,100"}'))!;
  assert.deepEqual(g.images, [
    "https://i3.example.com/005/abc123/1.webp",
    "https://i3.example.com/005/abc123/2.jpg",
    "https://i3.example.com/005/abc123/3.gif",
  ]);
  assert.equal(g.pages, 3);
});

test("the nested {fl:{...}} table form is understood", () => {
  const g = parseGallery(cfg, "1", page('{"fl":{"1":"w,1,1","2":"w,1,1","3":"p,1,1"},"th":{}}'))!;
  assert.deepEqual(g.images.map((u) => u.split(".").pop()), ["webp", "webp", "png"]);
});

test("regression: the 'g_thumb' CSS class must not be mistaken for the g_th table", () => {
  // before the fix every page defaulted to .jpg and downloads 404'd
  const g = parseGallery(cfg, "1", page('{"1":"w,1,1","2":"w,1,1","3":"w,1,1"}'))!;
  assert.ok(g.images.every((u) => u.endsWith(".webp")));
});

test("metadata is read from tag links, scoped to the gallery block (not nav, not related)", () => {
  const g = parseGallery(cfg, "1", page('{"1":"w,1,1","2":"w,1,1","3":"w,1,1"}'))!;
  assert.equal(g.title, "Some Title");
  assert.deepEqual(g.tags, ["blowjob", "big breasts"]); // counts stripped, nav and related excluded
  assert.deepEqual(g.artists, ["foo bar"]);
  assert.deepEqual(g.parodies, ["some show"]); // "original" is not a parody
  assert.deepEqual(g.languages, ["english", "translated"]);
  assert.deepEqual(g.categories, ["doujinshi"]);
});

test("a page with no title or no page count is rejected", () => {
  assert.equal(parseGallery(cfg, "1", "<html><body><h1></h1></body></html>"), null);
});

test("objectAt returns the first balanced object, including nested braces", () => {
  assert.equal(objectAt('x = {"a":{"b":1},"c":2}; y = {"z":1}', 0), '{"a":{"b":1},"c":2}');
  assert.equal(objectAt("no braces here", 0), null);
});

test("category mapping", () => {
  assert.equal(categoryFor(["Doujinshi"]), "DOUJINSHI");
  assert.equal(categoryFor(["artist cg"]), "ARTIST_CG");
  assert.equal(categoryFor(["image set"]), "IMAGE_SET");
  assert.equal(categoryFor(["something else"]), "OTHER");
});
