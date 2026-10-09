/**
 * Release names -> readable titles.
 *
 * Scanlation and doujin sites name a work like a file: "(C101) [Circle (Artist)] Title | Translated title [English]
 * [Group] {site.com} [Digital]". Everything around the title is already on the page as a tag (artist, circle, event,
 * language) or is advertising, so it only makes the heading, the link text and the search result worse. Pure, so every
 * rule has a test.
 */

export interface CleanedTitle {
  title: string;
  /** the part before a "|" (the name in the work's original language), when there was one */
  original: string | null;
  /** the first [bracket] block: usually the circle or artist */
  lead: string | null;
}

/** one [..], 【..】 or {..} block, in any of the bracket styles these sites mix */
const GROUP = "[\\[［【{｛][^\\]］】}｝]*[\\]］】}｝]";
const SQUARE_TAIL = new RegExp(`\\s*${GROUP}\\s*$`);
const LEAD_GROUPS = new RegExp(`^(?:\\s*${GROUP})+`);
const EVENT_BEFORE_GROUP = new RegExp(`^\\s*[(（][^()（）]{1,40}[)）]\\s*(?=${GROUP})`);
const LEAD_PAREN = /^[(（]([^()（）]{1,30})[)）]\s+(?=\S)/;

const LANGUAGES =
  "english|japanese|chinese|korean|spanish|french|german|italian|russian|portuguese|thai|vietnamese|indonesian|turkish|polish|arabic|dutch|ukrainian|hungarian|czech|romanian|filipino|tagalog|eng|jp|cn|kr";
/** what a trailing or inline (..) is allowed to be to count as noise: a format flag, never a parody or a magazine */
const NOISE_WORDS = `${LANGUAGES}|decensored|uncensored|censored|colou?r(?:ed|ized|ised)?|full colou?r|digital|ongoing|complete|completed|mtl|machine translated|translated|textless|raw|無修正|无修正|中国翻訳|日本語`;
const NOISE_PAREN_TAIL = new RegExp(`\\s*[(（]\\s*(?:${NOISE_WORDS}|\\d{4}[./-]\\d{1,2}(?:[./-]\\d{1,2})?)\\s*[)）]\\s*$`, "i");
/** a language or format flag, and the credit blocks that follow it ("[English] [Group] [Digital]") */
const NOISE_SQUARE = new RegExp(`\\s*[\\[［【]\\s*(?:${NOISE_WORDS}|hd|scan(?:s|mtl)?|\\d{4}-?\\d{0,2})\\s*[\\]］】](?:\\s*${GROUP})*`, "gi");
const BRACE = /\s*[{｛][^}｝]*[}｝]/g;
/** "Circle (Artist)] Title": the opening bracket got lost upstream */
const UNOPENED = /^([^[\]［］【】{}｛｝]{1,60}?)[\]］】]\s*/;

/** "A | B" -> ["A", "B"], ignoring a | inside [..], 【..】 or (..): "[远德 | 遠德]" is one circle name */
function splitPipes(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("[［【{｛(（".includes(ch)) depth++;
    else if ("]］】}｝)）".includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "|" || ch === "｜")) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}
/** a domain or URL: advertising the source of a scan, never part of a name */
const DOMAIN = /(?<=^|\s)(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|xxx|cc|io|club|site|top)(?:\/\S*)?(?=\s|$)/gi;

const innerText = (group: string) => group.replace(/^[\[［【{｛]\s*|\s*[\]］】}｝]$/g, "").trim();
const primaryName = (s: string) => s.replace(/\s*[(（].*$/, "").trim();
const tidy = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—_・:：;,]+/, "")
    .replace(/[\s\-–—_・:：;,]+$/, "")
    .trim();
const alnum = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");

/** Strip the packaging from one title segment. */
function strip(input: string): { text: string; lead: string | null } {
  let s = input.replace(/[　\s]+/g, " ").trim();
  let lead: string | null = null;

  // "(C101) [Translator] (C102) [Circle (Artist)] Title": event markers and bracket blocks, in any order
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(EVENT_BEFORE_GROUP, "");
    const m = LEAD_GROUPS.exec(s);
    if (m) {
      const one = new RegExp(`^\\s*(${GROUP})`).exec(m[0]);
      lead ??= one ? primaryName(innerText(one[1])) || null : null;
      s = s.slice(m[0].length);
    }
    if (s === before) break;
  }
  if (lead === null) {
    const p = LEAD_PAREN.exec(s);
    const broken = UNOPENED.exec(s);
    if (p && s.length - p[0].length >= 3) {
      lead = primaryName(p[1]) || null;
      s = s.slice(p[0].length);
    } else if (broken && s.length - broken[0].length >= 2) {
      lead = primaryName(broken[1]) || null;
      s = s.slice(broken[0].length);
    }
  }

  s = s.replace(BRACE, " "); // {hentailuxe.com}, {Doujins.com}
  s = s.replace(NOISE_SQUARE, " "); // [English] in the middle of a title
  for (let i = 0; i < 12; i++) {
    const next = s.replace(SQUARE_TAIL, "").replace(NOISE_PAREN_TAIL, "");
    if (next === s) break;
    s = next;
  }
  s = s.replace(DOMAIN, " ");
  return { text: tidy(s), lead };
}

/** Is this just a number or a few symbols, which says nothing about the work? */
const meaningless = (s: string) => alnum(s).length < 2 || /^[\d\s.#:+\-–]+$/.test(s);

/**
 * "[820] 112 [Korean]" -> "820 - 112" (the number alone says nothing, so the circle goes in front of it);
 * "(C101) [Circle (Artist)] Title | Translation [English] [Group] [Digital]" -> "Translation".
 * Never returns an empty string: a title that is nothing but brackets keeps its words.
 */
export function cleanTitle(raw: string): CleanedTitle {
  const whole = raw.trim();
  const parts = splitPipes(whole);
  // brackets belong to the whole release name, so strip them from the ends of the whole thing first
  const head = strip(parts[0] ?? whole);
  let lead = head.lead;
  const segments = [head.text];
  for (const p of parts.slice(1)) {
    const x = strip(p);
    lead ??= x.lead;
    segments.push(x.text);
  }
  const named = segments.filter((s) => !meaningless(s) || segments.length === 1);
  let title = named.length ? named[named.length - 1] : "";
  const original = named.length > 1 && named[0] !== title && !meaningless(named[0]) ? named[0] : null;

  if (meaningless(title)) {
    // nothing but a number (or nothing at all) is left: put the circle in front of it, or unwrap the brackets
    title = title && lead ? `${lead} - ${title}` : tidy(whole.replace(/[\[\]［］【】{}｛｝]/g, " ").replace(DOMAIN, " ")) || whole || "Untitled";
  }
  return { title, original, lead };
}
