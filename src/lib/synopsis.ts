import { langLabel } from "@/lib/format";
import { hentaiKind, titleCase } from "@/lib/seo";

/**
 * A short summary of a work built ONLY from facts we hold about it (who made it, what it parodies, who is in it, its
 * themes, how long it is, which translations exist). It never describes a plot, because we do not know one: that is
 * for a source description or an editor. The wording rotates with the work's number so neighbouring pages do not read
 * as copies of each other, and what it says differs wherever the facts differ.
 */
export interface SynopsisInput {
  publicId: number;
  title: string;
  language: string;
  category: string;
  pageCount: number;
  artists: string[];
  circles: string[];
  parodies: string[];
  characters: string[];
  tags: string[];
  /** other languages this work is available in */
  translations: string[];
}

/** tags that describe the file, not the story: not worth listing as themes */
const NOT_THEMES = new Set(["full color", "uncensored", "decensored", "digital", "english", "translated", "original", "anthology", "ongoing", "scanmark", "rough translation", "tankoubon", "doujin", "bad translation", "machine translated"]);
/** an event tag ("C96") or a file-level tag is not a theme */
const isMeta = (t: string) => NOT_THEMES.has(t.toLowerCase()) || /^c\d{2,3}$/i.test(t);

const list = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
const pick = <T>(options: T[], seed: number): T => options[Math.abs(seed) % options.length];

export function synopsis(w: SynopsisInput): string {
  const lang = langLabel(w.language);
  const kind = hentaiKind(w.category).toLowerCase();
  const artists = w.artists.slice(0, 2).map(titleCase);
  const circle = w.circles[0] ? titleCase(w.circles[0]) : "";
  const by = artists.length ? `by ${list(artists)}${circle && !artists.some((a) => a.toLowerCase() === circle.toLowerCase()) ? ` of ${circle}` : ""}` : circle ? `from ${circle}` : "";
  const pages = `${w.pageCount}-page`;
  const n = w.publicId;

  const opening = pick(
    [
      `${w.title} is ${article(pages)} ${pages} ${lang} ${kind}${by ? ` ${by}` : ""}.`,
      `${by ? `${article(lang)} ${lang} ${kind} ${by}, ` : `${article(lang)} ${lang} ${kind}, `}${w.title} runs ${w.pageCount} pages.`,
      `${by ? `${by.replace(/^(by|from) /, "")} is behind ` : "Here is "}${w.title}, ${article(pages)} ${pages} ${lang} ${kind}.`,
      `${w.title}: ${article(lang)} ${lang} ${kind} of ${w.pageCount} pages${by ? ` ${by}` : ""}.`,
    ],
    n,
  );

  const parody = w.parodies.find((p) => p.toLowerCase() !== "original");
  const cast = list(w.characters.slice(0, 3).map(titleCase));
  let setting = "";
  // the tags say which series it parodies and which characters appear; they do not say how the two connect
  if (parody && cast) setting = pick([`Parody: ${titleCase(parody)}. Characters: ${cast}.`, `Based on ${titleCase(parody)}; characters include ${cast}.`, `A ${titleCase(parody)} parody. Characters tagged: ${cast}.`], n + 1);
  else if (parody) setting = pick([`It is a parody of ${titleCase(parody)}.`, `Based on ${titleCase(parody)}.`], n + 1);
  else if (cast) setting = pick([`Characters include ${cast}.`, `Characters tagged: ${cast}.`], n + 1);
  else if (w.parodies.some((p) => p.toLowerCase() === "original")) setting = "It is an original work, not a parody.";

  const themes = w.tags.filter((t) => !isMeta(t)).slice(0, 5).map(titleCase);
  const themed = themes.length ? pick([`Themes include ${list(themes)}.`, `Tagged ${list(themes)}.`, `You will find ${list(themes)}.`], n + 2) : "";

  const others = w.translations.filter((l) => l !== w.language).map(langLabel);
  const also = others.length ? `Also available in ${list(others.slice(0, 4))}.` : "";

  const text = [opening, setting, themed, also].filter(Boolean).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1); // an opening that starts with "an English ..." still starts a sentence
}
