import { CORE_QUARANTINE } from "./core";
import { DEFAULT_ALLOWED, DEFAULT_DEFER, DEFAULT_REVIEW } from "./terms";

export type Verdict = "CLEAN" | "REVIEW" | "QUARANTINE";

export interface SafetyInput {
  title: string;
  altTitles?: string[];
  description?: string | null;
  tags: string[];
}

export interface SafetyResult {
  verdict: Verdict;
  /** e.g. ["tag:loli"], ["title:school uniform"] */
  reasons: string[];
  /** REVIEW only: hold the work without downloading any images until an admin approves */
  deferFetch: boolean;
}

export interface TermSet {
  quarantine: string[];
  defer: string[];
  review: string[];
  allowed: string[];
}

export const DEFAULT_TERMS: TermSet = {
  quarantine: [...CORE_QUARANTINE],
  defer: DEFAULT_DEFER,
  review: DEFAULT_REVIEW,
  allowed: DEFAULT_ALLOWED,
};

/** lowercase, strip diacritics, collapse everything non-alphanumeric to single spaces, pad with spaces */
export function norm(s: string): string {
  const t = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${t} `;
}

/**
 * Classify a work. The core quarantine terms are always enforced, whatever the
 * supplied term set says, so a bad or empty database cannot weaken the gate.
 */
export function classify(input: SafetyInput, terms: TermSet = DEFAULT_TERMS): SafetyResult {
  const quarantineTerms = [...new Set([...CORE_QUARANTINE, ...terms.quarantine])];
  const allowed = terms.allowed.map(norm);
  const mask = (n: string) => allowed.reduce((out, a) => out.split(a).join(" "), n);
  const hits = (haystack: string, list: string[]) => {
    const h = mask(haystack);
    return list.filter((t) => h.includes(norm(t)));
  };

  const named = [input.title, ...(input.altTitles ?? [])];
  const scan = (list: string[], withDescription: boolean) => {
    const found: string[] = [];
    for (const tag of input.tags) for (const t of hits(norm(tag), list)) found.push(`tag:${t}`);
    for (const title of named) for (const t of hits(norm(title), list)) found.push(`title:${t}`);
    if (withDescription && input.description)
      for (const t of hits(norm(input.description), list)) found.push(`description:${t}`);
    return [...new Set(found)];
  };

  // QUARANTINE: tags + titles only (never the description)
  const quarantine = scan(quarantineTerms, false);
  if (quarantine.length) return { verdict: "QUARANTINE", reasons: quarantine, deferFetch: false };

  // DEFER: explicit age markers in tags + titles. Held without downloading anything.
  const defer = scan(terms.defer, false);
  const review = scan(terms.review, true);
  if (defer.length) return { verdict: "REVIEW", reasons: [...defer, ...review], deferFetch: true };

  if (review.length) return { verdict: "REVIEW", reasons: review, deferFetch: false };
  return { verdict: "CLEAN", reasons: [], deferFetch: false };
}
