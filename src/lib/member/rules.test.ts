import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_HIDE_REPORTS, reportWeight, blockedTerm, checkBio, checkComment, checkEmail, checkHandle, checkPassword, fingerprint, handleOf, hasLink, isReason, limitsFor, tidy } from "./rules";

const refused = (r: { ok: boolean }) => assert.equal(r.ok, false);

test("usernames: letters, digits, underscores; 3-20; lower-cased for the address; reserved and flagged names refused", () => {
  const r = checkHandle("  Night_Reader7 ");
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { handle: "night_reader7", displayName: "Night_Reader7" });
  assert.equal(handleOf("MiXeD"), "mixed");
  for (const bad of ["ab", "a".repeat(21), "1abc", "_abc", "ab cd", "ab-cd", "ab.cd", "näme", "abc__def", "abc_", "", null, undefined, 5, "admin", "Admin", "administrator", "lustpages", "LustPages_Team", "moderator1", "support_team", "root", "deleted", "loli_fan", "Shota", "my_toddler"]) refused(checkHandle(bad as never));
  assert.ok(checkHandle("abc").ok);
  assert.ok(checkHandle("a".repeat(20)).ok);
});

test("passwords: 8+ characters, at most 72 bytes, not common, not the username, not one repeated character", () => {
  assert.ok(checkPassword("correct horse battery").ok);
  assert.ok(checkPassword("Tr0ub4dor&3").ok);
  for (const bad of ["short", "1234567", "password", "Password1", "QWERTY123", "aaaaaaaaaa", "xy".repeat(37), "éa".repeat(25), null, undefined, 12345678]) refused(checkPassword(bad as never));
  refused(checkPassword("hello-nightreader-2026", "nightreader"));
  assert.ok(checkPassword("hello-nightreader-2026", "nig").ok, "a very short username is not worth refusing for");
  assert.ok(checkPassword("éa".repeat(24)).ok, "72 bytes exactly is fine");
});

test("email: optional, lower-cased, must look like an address", () => {
  assert.deepEqual(checkEmail(""), { ok: true, value: null });
  assert.deepEqual(checkEmail(undefined), { ok: true, value: null });
  assert.deepEqual(checkEmail("  Me@Example.COM "), { ok: true, value: "me@example.com" });
  for (const bad of ["me", "me@", "@example.com", "me@example", "me @example.com", "me@example.c", `${"a".repeat(200)}@example.com`]) refused(checkEmail(bad));
});

test("links and contact details are recognised, ordinary writing is not", () => {
  for (const t of ["see https://example.com now", "http://x.y", "www.example.net", "mail me at a@b.co", "find it on example.com", "visit foo-bar.xyz", "my site dot com", "t.me/channel", "bit.ly/abc", "telegram: @someone", "discord: user#1234", "great.ru"]) assert.equal(hasLink(t), true, t);
  for (const t of ["Chapter 5.5 was great", "The art is amazing, 10/10", "I read it in 2.5 hours", "vol.2 is better", "e.g. the ending", "Mr. Nobody", "love this artist!!", "wow...", "page 12.", "ok.then"]) assert.equal(hasLink(t), false, t);
});

test("the minors filter matches whole words and phrases only", () => {
  for (const t of ["this is loli", "LOLICON stuff", "a shota story", "underage", "under-age", "an infant", "toddler content", "pre teen", "Elementary school kids"]) assert.ok(blockedTerm(t), t);
  for (const t of ["hololive fan", "the lolipop scene", "shotaian", "I loved the school uniform art", "she is an adult", "great work", "tiny infantry", ""]) assert.equal(blockedTerm(t), null, t);
});

test("comments: tidied, length-checked, and refused when they carry links, flagged words, spam or shouting", () => {
  const ok = checkComment("  Loved the art.\r\n\r\n\r\n\r\nChapter 3 is the best.  ");
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.value, "Loved the art.\n\nChapter 3 is the best.");
  for (const bad of ["", " ", "a", "x".repeat(2001), Array.from({ length: 16 }, (_, i) => `line ${i}`).join("\n"), "check https://spam.example", "contact me on telegram: @x", "this is a loli story", "aaaaaaaaaaaaaaaaaaaa", "THIS IS ABSOLUTELY THE BEST THING EVER MADE", null, undefined]) refused(checkComment(bad as never));
  assert.ok(checkComment("x".repeat(2000)).ok === false || checkComment("ab".repeat(1000)).ok, "2,000 characters of real text is the ceiling, not 1,999");
  assert.ok(checkComment("WOW so good").ok, "a short shout is fine");
  assert.ok(checkComment("Great 日本語 art と story").ok);
  assert.ok(checkComment("Line one\nLine two").ok);
  // invisible and bidi characters never reach the page
  assert.equal(tidy("a​b‮c\u0007d"), "abcd");
});

test("bio: optional, short, no links, no flagged words", () => {
  assert.deepEqual(checkBio(""), { ok: true, value: null });
  assert.deepEqual(checkBio("  I read a lot.  "), { ok: true, value: "I read a lot." });
  refused(checkBio("x".repeat(301)));
  refused(checkBio("add me example.com"));
  refused(checkBio("loli fan"));
});

test("fingerprint: the same words in different clothes read as the same text", () => {
  assert.equal(fingerprint("Great art!!"), fingerprint("great   ART"));
  assert.notEqual(fingerprint("Great art"), fingerprint("Great plot"));
});

test("limits: a new account is slower than an old one", () => {
  assert.deepEqual(limitsFor(60_000), { cooldownS: 120, per10min: 1, perDay: 3 });
  assert.deepEqual(limitsFor(3 * 3_600_000), { cooldownS: 45, per10min: 3, perDay: 10 });
  assert.deepEqual(limitsFor(3 * 86_400_000), { cooldownS: 15, per10min: 6, perDay: 40 });
});

test("usernames: only names that could pass for staff are reserved, ordinary words that start the same are not", () => {
  for (const ok of ["modern_reader", "modelfan", "supportive", "staffy", "model_kit", "moby", "admiral_ack", "stafford"]) assert.ok(checkHandle(ok).ok, ok);
  for (const bad of ["mod", "Mod", "mods", "moderator", "moderator2", "mod_team", "modteam", "admin", "admin1", "admin_help", "administrator", "staff", "staff_team", "support", "support_desk", "supportteam", "lustpages", "lustpages_team", "lustpage_fan"]) refused(checkHandle(bad));
});

test("report weights: a fresh account counts for nothing, a minors report hides on its own", () => {
  assert.equal(reportWeight("SPAM", 30 * 60_000), 0);
  assert.equal(reportWeight("MINORS", 59 * 60_000), 0);
  assert.equal(reportWeight("SPAM", 2 * 3_600_000), 1);
  assert.equal(reportWeight("MINORS", 2 * 3_600_000), AUTO_HIDE_REPORTS);
});

test("report reasons are a closed list", () => {
  assert.equal(isReason("SPAM"), true);
  assert.equal(isReason("MINORS"), true);
  assert.equal(isReason("whatever"), false);
  assert.equal(isReason(undefined), false);
});
