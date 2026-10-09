import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgo, parseH2rStats, parseImStats } from "./stats";

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

test("relative times become dates", () => {
  assert.equal(parseAgo("9 hours ago", NOW)?.toISOString(), hoursAgo(9));
  assert.equal(parseAgo("an hour ago", NOW)?.toISOString(), hoursAgo(1));
  assert.equal(parseAgo("1 day ago", NOW)?.toISOString(), hoursAgo(24));
  assert.equal(parseAgo("2 weeks ago", NOW)?.toISOString(), hoursAgo(24 * 14));
  assert.equal(parseAgo("yesterday", NOW)?.toISOString(), hoursAgo(24));
  assert.equal(parseAgo("just now", NOW)?.toISOString(), hoursAgo(0));
  assert.equal(parseAgo("3 months ago", NOW)!.getTime() < NOW - 80 * 86_400_000, true);
  assert.equal(parseAgo("soon", NOW), undefined);
  assert.equal(parseAgo("", NOW), undefined);
});

test("nhentai.xxx: favorites and the upload time", () => {
  const html = `<div>Languages chinese 175K Category doujinshi 540K Pages: 21 <span>Uploaded:</span> 9 hours ago <a>Favorite ( 1,204 )</a> Download Report</div>`;
  assert.deepEqual(parseImStats(html, NOW), { favorites: 1204, publishedAt: new Date(NOW - 9 * 3_600_000) });
});

test("HentaiFox: favorites and 'Posted'", () => {
  const html = `<li>Pages: 6</li><li>Posted: 1 day ago</li> <span>2</span> <span>1</span> <a>Download (9)</a> <a>Favorite (5)</a> <a>Fapped!</a>`;
  const s = parseImStats(html, NOW);
  assert.equal(s.favorites, 5);
  assert.equal(s.publishedAt?.toISOString(), hoursAgo(24));
  assert.equal(s.rating, undefined);
});

test("HentaiEra: likes and dislikes become a rating out of 10", () => {
  const html = `Category western 17 Pages <b>Like ( 9 )</b> <b>Dislike ( 1 )</b> <b>Favourite ( 42 )</b> <b>Download ( 3 )</b> Report`;
  const s = parseImStats(html, NOW);
  assert.equal(s.favorites, 42);
  assert.equal(s.votes, 10);
  assert.equal(s.rating, 9);
});

test("HentaiEra with no votes yet has no rating, and 'Dislike' is not read as 'Like'", () => {
  const s = parseImStats(`Like ( 0 ) Dislike ( 0 ) Favourite ( 0 ) Download ( 0 )`, NOW);
  assert.deepEqual(s, { favorites: 0 });
  assert.equal(parseImStats(`Dislike ( 4 ) Favourite ( 1 )`, NOW).rating, undefined);
});

test("AsmHentai: just the favorites; a page with no counters gives nothing", () => {
  assert.deepEqual(parseImStats(`Pages: 21 Favorite (1) Report`, NOW), { favorites: 1 });
  assert.deepEqual(parseImStats(`<html><body>nothing here</body></html>`, NOW), {});
  assert.deepEqual(parseImStats(`<script>var Favorite (99)</script> no counters`, NOW), {}); // script contents are ignored
});

test("Hentai2Read: rating out of 5 doubled to 10, votes, views and bookmarks", () => {
  const html = `<span>31547 Read List</span> <small> (score 4.5/5 with 15,014 votes)</small> <li><b>View</b> 8,240 views</li>`;
  assert.deepEqual(parseH2rStats(html), { rating: 9, votes: 15014, views: 8240, favorites: 31547 });
  assert.deepEqual(parseH2rStats("<p>nothing</p>"), {});
});
