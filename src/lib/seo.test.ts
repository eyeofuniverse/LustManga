import { test } from "node:test";
import assert from "node:assert/strict";
import { esc } from "./sitemap-xml";
import { normalizeSiteUrl } from "./site";
import {
  abs, breadcrumbLd, clip, clipTitle, excerpt, faqLd, hreflangFor, isFiltered, itemListLd, ldJson, listingMeta, socialMeta, tagSeo, titleCase,
  withPage, workDescription, workLd, workTitle, type WorkForSeo,
} from "./seo";

const work = (over: Partial<WorkForSeo> = {}): WorkForSeo => ({
  publicId: 74,
  slug: "in-a-world",
  title: "In a World Full of Zombies",
  language: "en",
  category: "MANGA",
  pageCount: 933,
  coverKey: "c/x.webp",
  createdAt: "2026-10-01T00:00:00.000Z",
  tags: [
    { type: "ARTIST", name: "masuda chihiro" },
    { type: "TAG", name: "big breasts" },
    { type: "TAG", name: "zombies" },
    { type: "PARODY", name: "original" },
  ],
  ...over,
});

test("clip cuts at a word and never past the limit", () => {
  assert.equal(clip("short", 20), "short");
  const out = clip("the quick brown fox jumps over the lazy dog", 24);
  assert.ok(out.length <= 24, out);
  assert.ok(out.endsWith("…"));
  assert.ok(!/\s…$/.test(out));
  assert.equal(clip("  lots   of\n space ", 50), "lots of space");
  assert.equal(clip(null, 10), "");
});

test("excerpt prefers a sentence boundary", () => {
  assert.equal(excerpt("This first sentence is long enough. Then a second sentence keeps going and going on.", 50), "This first sentence is long enough.");
  assert.equal(excerpt("No stops here but it is long enough to need cutting somewhere", 30).endsWith("…"), true);
});

test("tag names become title case, but names that already have capitals or are not Latin are left alone", () => {
  assert.equal(titleCase("big breasts"), "Big Breasts");
  assert.equal(titleCase("fate/grand order"), "Fate/Grand Order");
  assert.equal(titleCase("x-ray vision"), "X-Ray Vision");
  assert.equal(titleCase("NTR"), "NTR");
  assert.equal(titleCase("ゼンゼロ"), "ゼンゼロ");
  assert.equal(titleCase("Already Fine"), "Already Fine");
});

test("paginated titles are unique", () => {
  assert.equal(withPage("Browse", 1), "Browse");
  assert.equal(withPage("Browse", 3), "Browse - Page 3");
});

test("a control character in a title cannot break a feed or a sitemap", () => {
  assert.equal(esc("bad\u0008title\u0000!\u001f"), "badtitle!");
  assert.equal(esc("tab\tand\nnewline stay"), "tab\tand\nnewline stay");
});

test("a work title leads with the name, says what it is, and marks a translation", () => {
  assert.equal(workTitle(work()), "In a World Full of Zombies - Read Hentai Manga Online");
  assert.equal(workTitle(work({ language: "es", category: "DOUJINSHI" })), "In a World Full of Zombies (Spanish) - Read Hentai Doujinshi Online");
  const long = workTitle(work({ title: "A".repeat(40) + " " + "word ".repeat(30) }));
  assert.ok(long.length + " | LustPages".length <= 90, `${long.length}: ${long}`);
  assert.ok(long.endsWith("- Read Hentai Manga Online"));
  assert.ok(!/\w…/.test(long), `cut mid-word: ${long}`);
});

test("a very short title borrows its artist, so it is not the same as every other short one", () => {
  assert.equal(workTitle(work({ title: "Fanbox" })), "Fanbox by Masuda Chihiro - Read Hentai Manga Online");
  assert.equal(workTitle(work({ title: "Fanbox", tags: [] })), "Fanbox - Read Hentai Manga Online");
});

test("a long title is cut at a natural break, never in the middle of a word, and never leaves a bracket open", () => {
  assert.equal(clipTitle("short title", 40), "short title");
  assert.equal(clipTitle("Zenbu Misemasu! Houkago Hamedori Doukoukai - At afterschool, You're making your debut", 50), "Zenbu Misemasu! Houkago Hamedori Doukoukai");
  assert.equal(clipTitle("Wakamo 1 (Blue Archive Special Edition Extra Long Name)", 30), "Wakamo 1");
  assert.equal(clipTitle("先生、みんながシコすぎて授業に集中できません。誰かにコキ捨てていいですか", 26), "先生、みんながシコすぎて授業に集中できません。");
  // an unbroken run with no break anywhere is the only time the ellipsis appears
  assert.equal(clipTitle("あ".repeat(40), 10), "あ".repeat(9) + "…");
});

test("a work description is factual, complete and within 160 characters", () => {
  const d = workDescription(work({ description: "Takemura wakes up after falling ill for 3 days and realises the world has been overrun by zombies.", tags: [...work().tags!, { type: "CHARACTER", name: "takemura" }] }));
  assert.ok(d.length <= 160, `${d.length}: ${d}`);
  assert.ok(d.startsWith("Read In a World Full of Zombies online: an English hentai manga by Masuda Chihiro"), d);
  assert.ok(d.includes("933 pages"));
  assert.ok(d.includes("Takemura wakes up"), "the synopsis leads when there is one");
  assert.ok(!/Free on /.test(d), "no boilerplate sentence shared by every page");
});

test("without a synopsis the description lists who is in it and the tags instead", () => {
  const d = workDescription(work({ description: null, tags: [...work().tags!, { type: "CHARACTER", name: "takemura" }] }));
  assert.ok(d.length <= 160, d);
  assert.ok(d.includes("Featuring Takemura."), d);
  assert.ok(d.includes("Tags: Big Breasts, Zombies."), d);
  assert.ok(!d.includes("(Original)"), "an 'original' parody says nothing");
});

test("a very long title or no extra data still gives a clean description", () => {
  const d = workDescription(work({ title: "Z".repeat(300), tags: [], description: null }));
  assert.ok(d.length <= 160);
  const bare = workDescription(work({ tags: [], description: null }));
  assert.ok(bare.startsWith("Read In a World Full of Zombies online: an English hentai manga"));
});

test("list pages: plain page 1 and 2 index with their own canonical", () => {
  const p1 = listingMeta({ base: "/browse", page: 1, filtered: false, count: 50 });
  assert.equal(p1.alternates?.canonical, "/browse");
  assert.equal((p1.robots as { index: boolean }).index, true);
  const p2 = listingMeta({ base: "/browse", page: 2, filtered: false, count: 50 });
  assert.equal(p2.alternates?.canonical, "/browse?page=2");
  assert.equal((p2.robots as { index: boolean }).index, true);
});

test("list pages: filtered variants, deep pages and thin lists are noindex but still followed", () => {
  const filtered = listingMeta({ base: "/tag/x", page: 3, filtered: true, count: 50 });
  assert.equal(filtered.alternates?.canonical, "/tag/x"); // folds into the plain list, not "?page=3"
  assert.equal((filtered.robots as { index: boolean }).index, false);
  assert.equal((filtered.robots as { follow: boolean }).follow, true);
  assert.equal((listingMeta({ base: "/browse", page: 6, filtered: false, count: 500 }).robots as { index: boolean }).index, false);
  assert.equal((listingMeta({ base: "/browse", page: 5, filtered: false, count: 500 }).robots as { index: boolean }).index, true);
  assert.equal((listingMeta({ base: "/artist/a", page: 1, filtered: false, count: 1, minCount: 2 }).robots as { index: boolean }).index, false);
  assert.equal((listingMeta({ base: "/artist/a", page: 1, filtered: false, count: 2, minCount: 2 }).robots as { index: boolean }).index, true);
});

test("what counts as a filtered variant", () => {
  assert.equal(isFiltered({}), false);
  assert.equal(isFiltered({ page: "4" }), false);
  for (const k of ["sort", "lang", "cat", "q", "letter"]) assert.equal(isFiltered({ [k]: "x" }), true, k);
  assert.equal(isFiltered({ sort: "" }), false);
});

test("tag, artist and category titles say what the page is", () => {
  const t = tagSeo("tag", "big breasts", 471);
  assert.equal(t.title, "Big Breasts Hentai Manga & Doujinshi - Read Online");
  assert.equal(t.h1, "Big Breasts");
  assert.ok(t.description.includes("471 works") && t.description.length <= 160);
  assert.equal(tagSeo("artist", "masuda chihiro", 1).title, "Masuda Chihiro Hentai Manga & Doujinshi by Masuda Chihiro");
  assert.ok(tagSeo("artist", "x", 1).description.includes("1 work "));
  assert.equal(tagSeo("category", "doujinshi", 776).title, "Doujinshi Hentai - Read Online Free");
  assert.ok(tagSeo("parody", "touhou project", 12).title.includes("Parody"));
  for (const type of ["tag", "artist", "group", "parody", "character", "language", "category"]) assert.ok(tagSeo(type, "name", 5).description.length <= 160, type);
});

test("translations reference each other once per language", () => {
  const self = { publicId: 1, slug: "a", language: "en" };
  const others = [{ publicId: 2, slug: "b", language: "es" }, { publicId: 3, slug: "c", language: "es" }, { publicId: 4, slug: "d", language: "ja" }];
  assert.deepEqual(hreflangFor(self, others), { en: "/g/1-a", es: "/g/2-b", ja: "/g/4-d" });
  assert.deepEqual(hreflangFor(self, []), {}); // nothing to link to
});

test("structured data is absolute and cannot break out of its script tag", () => {
  assert.equal(abs("/browse"), "http://localhost:3000/browse");
  assert.equal(abs("https://x.test/a"), "https://x.test/a");
  const b = breadcrumbLd([{ name: "Home", path: "/" }, { name: "Browse", path: "/browse" }]);
  assert.equal(b.itemListElement[1].item, "http://localhost:3000/browse");
  assert.equal(b.itemListElement[1].position, 2);
  assert.ok(!ldJson({ name: "</script><script>alert(1)" }).includes("</script>"));
  assert.equal(JSON.parse(ldJson({ a: "<b>" })).a, "<b>");
});

test("a work's structured data carries language, authors, tags and translations", () => {
  const ld = workLd(work({ titleOriginal: "原題" }), { kind: "ONESHOT", cover: "https://cdn.test/c.webp", variants: [{ publicId: 9, slug: "es", language: "es" }] }) as Record<string, unknown>;
  assert.equal(ld["@type"], "Book");
  assert.equal(ld.inLanguage, "en");
  assert.equal(ld.numberOfPages, 933);
  assert.equal(ld.alternateName, "原題");
  assert.deepEqual((ld.author as { name: string }[]).map((a) => a.name), ["Masuda Chihiro"]);
  assert.deepEqual(ld.genre, ["Big Breasts", "Zombies"]);
  assert.equal((ld.workTranslation as { inLanguage: string }[])[0].inLanguage, "es");
  assert.equal(ld.isFamilyFriendly, false);
  assert.equal(ld.bookFormat, "https://schema.org/GraphicNovel");
  const series = workLd(work(), { kind: "SERIES", cover: null, chapters: 46 }) as Record<string, unknown>;
  assert.equal(series["@type"], "ComicSeries");
  assert.deepEqual(series.hasPart, { "@type": "CreativeWorkSeason", numberOfEpisodes: 46 });
  assert.equal(series.numberOfPages, undefined);
});

test("item lists keep their position across pages", () => {
  const ld = itemListLd([{ publicId: 1, slug: "a", title: "A" }, { publicId: 2, slug: "b", title: "B" }], 24);
  assert.deepEqual(ld.itemListElement.map((i) => i.position), [25, 26]);
});

test("social cards: og:url only when a page names itself", () => {
  const withPath = socialMeta({ title: "T", description: "D", path: "/x" }).openGraph as { url?: string; images?: unknown[] };
  assert.equal(withPath.url, "/x");
  assert.equal(withPath.images?.length, 1);
  assert.equal((socialMeta({ title: "T", description: "D" }).openGraph as { url?: string }).url, undefined);
  assert.equal((socialMeta({ title: "T", description: "D", path: "/x", image: false }).openGraph as { images?: unknown }).images, undefined);
});

test("faq structured data mirrors the questions", () => {
  const ld = faqLd([{ q: "Q?", a: "A." }]);
  assert.equal(ld.mainEntity[0].acceptedAnswer.text, "A.");
});

test("the site address is cleaned up whatever was typed into the setting", () => {
  assert.equal(normalizeSiteUrl("https://example.com"), "https://example.com");
  assert.equal(normalizeSiteUrl("https://example.com/"), "https://example.com");
  assert.equal(normalizeSiteUrl("example.com"), "https://example.com");
  assert.equal(normalizeSiteUrl("  https://Example.com/en/page?x=1 "), "https://example.com");
  assert.equal(normalizeSiteUrl("http://localhost:3200/"), "http://localhost:3200");
  assert.equal(normalizeSiteUrl("lust-manga.vercel.app"), "https://lust-manga.vercel.app");
  assert.equal(normalizeSiteUrl(""), "");
  assert.equal(normalizeSiteUrl(undefined), "");
  assert.equal(normalizeSiteUrl("http://"), "");
});
