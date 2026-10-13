import { DEFAULT_DEFER, LEGACY_QUARANTINE_TERMS } from "@/lib/safety/terms";
import { norm } from "@/lib/safety/classify";
import { COMMENT_MAX, REPORT_REASONS } from "./constants";
export { COMMENT_MAX, REPORT_REASONS };

/**
 * What a member may sign up with and post. Pure (no database, no cookies), so every rule that keeps the community safe is
 * tested. The rules are deliberately strict: a comment is optional, and a refused one can simply be rewritten.
 */

/* ───────────── names ───────────── */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt reads no more than 72 bytes
export const BIO_MAX = 300;
export const COMMENT_MIN = 2;
export const COMMENT_MAX_LINES = 15;

/** Names that would pass for the site, its staff or a system account. */
const RESERVED = new Set([
  "admin", "administrator", "root", "system", "support", "staff", "moderator", "mod", "owner", "console", "official", "help",
  "lustpages", "lustpage", "lusthentai", "lusttube", "anonymous", "anon", "guest", "null", "undefined", "deleted", "removed", "unknown",
  "me", "you", "api", "www", "mail", "login", "logout", "signup", "signin", "account", "settings", "profile", "u", "user", "users",
  "dmca", "abuse", "security", "privacy", "terms", "webmaster", "postmaster",
]);

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** The sign-in name and profile address: lower case, whatever capitals were typed. */
export const handleOf = (name: string): string => name.trim().toLowerCase();

/** 3-20 letters, digits and underscores, starting with a letter, not a reserved name and not a flagged word. */
export function checkHandle(raw: unknown): Checked<{ handle: string; displayName: string }> {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length < HANDLE_MIN || name.length > HANDLE_MAX) return bad(`Pick a username of ${HANDLE_MIN} to ${HANDLE_MAX} characters.`);
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return bad("Usernames use letters, digits and underscores, and start with a letter.");
  if (/__/.test(name) || name.endsWith("_")) return bad("Usernames cannot have double or trailing underscores.");
  const handle = handleOf(name);
  // staff-like names: the exact words, and the longer ones that begin like the site or its team ("modern_reader" and "supportive" are fine)
  // the site's own names, and staff-like names ("admin", "support_team", "mod2"); a word that merely starts the same ("modern_reader", "supportive") is fine
  if (RESERVED.has(handle) || /^lust(page|hentai|tube)/.test(handle) || /^(admin|administrator|staff|support|moderator|mods?|owner|official)(_?(team|desk|help|official|staff|admin|support|mods?|\d+))*$/.test(handle)) return bad("That username is not available.");
  if (blockedTerm(handle.replace(/_/g, " "))) return bad("That username is not available.");
  return { ok: true, value: { handle, displayName: name } };
}

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123", "iloveyou", "11111111",
  "00000000", "abcd1234", "letmein1", "welcome1", "admin123", "football", "monkey123", "dragon123", "sunshine", "princess1",
]);

export function checkPassword(raw: unknown, handle = ""): Checked<string> {
  const pw = typeof raw === "string" ? raw : "";
  if (pw.length < PASSWORD_MIN) return bad(`Use a password of at least ${PASSWORD_MIN} characters.`);
  if (Buffer.byteLength(pw, "utf8") > PASSWORD_MAX) return bad(`That password is too long (${PASSWORD_MAX} bytes at most).`);
  if (COMMON.has(pw.toLowerCase())) return bad("That password is too common. Pick something harder to guess.");
  if (handle && pw.toLowerCase().includes(handle.toLowerCase()) && handle.length >= 4) return bad("The password should not contain your username.");
  if (/^(.)\1+$/.test(pw)) return bad("Pick a password that is not one repeated character.");
  return { ok: true, value: pw };
}

/** Optional. Not verified (there is no mail yet), so it only has to look like an address. */
export function checkEmail(raw: unknown): Checked<string | null> {
  const e = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!e) return { ok: true, value: null };
  if (e.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return bad("That email address does not look right. It is optional: leave it empty to skip.");
  return { ok: true, value: e };
}

/* ───────────── text ───────────── */

/** a word or phrase that has no place in a username, profile or comment (minors, in any spelling we list) */
const BLOCKED = [...new Set([...LEGACY_QUARANTINE_TERMS, ...DEFAULT_DEFER])].map(norm);

/** The listed term the text contains as whole words, or null. */
export function blockedTerm(text: string): string | null {
  const n = norm(text);
  const hit = BLOCKED.find((t) => n.includes(t));
  return hit ? hit.trim() : null;
}

/** web addresses, bare domains, emails and the usual ways of writing them around a filter */
const LINKY = [
  /\bhttps?:\/\//i,
  /\bwww\./i,
  /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
  /\b[a-z0-9][a-z0-9-]{1,}\.(?:com|net|org|io|co|me|xyz|ru|cn|ly|to|tv|cc|info|site|online|top|club|app|dev|gg|link|ws|vip|xxx|porn|sex|adult|shop|store|biz|us|uk|de|fr|jp|tk|ml|ga|cf|gq|pw|live|fun|cam)\b/i,
  /\bdot\s*(?:com|net|org|ru|xyz)\b/i,
  /\b(?:t\.me|bit\.ly|discord\.gg|wa\.me)\b/i,
  /\b(?:telegram|whatsapp|discord|snapchat|kik)\s*[:@-]\s*\S+/i,
];
export const hasLink = (text: string): boolean => LINKY.some((r) => r.test(text));

/** a comment tidied for storage: line endings, runs of blank lines and trailing spaces */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, "") // control and invisible/bidi characters
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function checkBio(raw: unknown): Checked<string | null> {
  const t = tidy(typeof raw === "string" ? raw : "");
  if (!t) return { ok: true, value: null };
  if (t.length > BIO_MAX) return bad(`Keep the bio to ${BIO_MAX} characters.`);
  if (hasLink(t)) return bad("Links and contact details are not allowed in a bio.");
  if (blockedTerm(t)) return bad("That bio cannot be saved.");
  return { ok: true, value: t };
}

/** The single message for anything that trips the minors filter: it says no more than it has to. */
export const BLOCKED_MESSAGE = "That cannot be posted: it mentions something this site does not allow.";

export function checkComment(raw: unknown): Checked<string> {
  const t = tidy(typeof raw === "string" ? raw : "");
  if (t.length < COMMENT_MIN) return bad("Write a little more before posting.");
  if (t.length > COMMENT_MAX) return bad(`Comments are ${COMMENT_MAX.toLocaleString("en-US")} characters at most (this one is ${t.length.toLocaleString("en-US")}).`);
  if (t.split("\n").length > COMMENT_MAX_LINES) return bad(`Please keep it to ${COMMENT_MAX_LINES} lines.`);
  if (hasLink(t)) return bad("Links, usernames of other sites and contact details are not allowed in comments.");
  if (blockedTerm(t)) return bad(BLOCKED_MESSAGE);
  if (/(.)\1{14,}/u.test(t)) return bad("That looks like spam. Please write it out normally.");
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 25 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return bad("Please do not write in all capitals.");
  return { ok: true, value: t };
}

/** one comparable form of a comment, to catch the same text posted again */
export const fingerprint = (text: string): string => norm(text).replace(/\s+/g, " ").trim();

/* ───────────── limits ───────────── */

export interface CommentLimits {
  /** seconds a member must wait between two comments */
  cooldownS: number;
  /** comments in the last 10 minutes / the last 24 hours */
  per10min: number;
  perDay: number;
}

/** A brand-new account is held to a slower pace, which is what stops a sign-up-and-spam run. */
export function limitsFor(accountAgeMs: number): CommentLimits {
  if (accountAgeMs < 10 * 60_000) return { cooldownS: 120, per10min: 1, perDay: 3 };
  if (accountAgeMs < 24 * 3_600_000) return { cooldownS: 45, per10min: 3, perDay: 10 };
  return { cooldownS: 15, per10min: 6, perDay: 40 };
}

/** A comment goes out of sight when this many different members have reported it (a moderator then decides). */
export const AUTO_HIDE_REPORTS = 3;

/**
 * How much one report counts towards hiding a comment. A report from an account less than an hour old counts for nothing (it is
 * still kept for the moderators), so a handful of fresh accounts cannot hide anyone's comment. A report that a comment mentions
 * minors counts as much as the whole threshold: that one is hidden at once and a moderator decides.
 */
export function reportWeight(reason: string, reporterAgeMs: number): number {
  if (reporterAgeMs < 3_600_000) return 0;
  return reason === "MINORS" ? AUTO_HIDE_REPORTS : 1;
}

export const isReason = (v: unknown): v is (typeof REPORT_REASONS)[number]["value"] => REPORT_REASONS.some((r) => r.value === v);
