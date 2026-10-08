import { test } from "node:test";
import assert from "node:assert/strict";
import { readHref, tagHref, workHref } from "./format";

const asciiOnly = (s: string) => /^[\x21-\x7e]+$/.test(s);

test("work links are always valid URLs, even for Japanese or Chinese slugs", () => {
  assert.equal(workHref({ publicId: 74, slug: "in-a-world" }), "/g/74-in-a-world");
  assert.equal(workHref({ publicId: 5, slug: "" }), "/g/5-work");
  const jp = workHref({ publicId: 115, slug: "全裸登校3番外" });
  assert.ok(asciiOnly(jp), jp); // a raw non-ASCII character in a redirect Location header is a 500
  assert.equal(decodeURIComponent(jp), "/g/115-全裸登校3番外");
  assert.ok(asciiOnly(workHref({ publicId: 1, slug: "a b/c?d#e" })));
});

test("tag and reader links encode too", () => {
  assert.ok(asciiOnly(tagHref("tag", "ゼンゼロ")));
  assert.equal(readHref(74, 3.5, 12), "/read/74/3.5?p=12");
  assert.equal(readHref(74, 1), "/read/74/1");
});
