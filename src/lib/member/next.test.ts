import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./next";

test("safeNext: only a path on this site", () => {
  assert.equal(safeNext("/g/896-enjo-kouhai"), "/g/896-enjo-kouhai");
  assert.equal(safeNext("/browse?sort=new&page=2"), "/browse?sort=new&page=2");
  assert.equal(safeNext("/account#profile"), "/account#profile");
  const bad = ["https://evil.example", "//evil.example", "/\\evil.example", "\\\\evil.example", "javascript:alert(1)", "evil", "", null, undefined, 5, "/api/x", "/console", "/console/login", "/login", "/signup?next=/", "/forgot", "/go/ad/x", "/a\nb", "/x".repeat(200)];
  for (const b of bad) assert.equal(safeNext(b as never, "/home"), "/home", String(b).slice(0, 30));
  assert.equal(safeNext("/apiary"), "/apiary", "only the /api/ prefix is refused, not words that start with it");
});
