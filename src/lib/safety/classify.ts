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
  quarantine: [],
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

/** Classify a work against the live editable terms. */
export function classify(input: SafetyInput, terms: TermSet = DEFAULT_TERMS): SafetyResult {
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

  // Quarantine is only for terms explicitly configured by an admin. The former
  // built-in terms are ordinary DEFER entries and therefore create metadata-only drafts.
  const quarantine = scan(terms.quarantine, false);
  if (quarantine.length) return { verdict: "QUARANTINE", reasons: quarantine, deferFetch: false };

  // DEFER: flagged metadata is held without fetching images until an admin approves.
  const defer = scan(terms.defer, true);
  const review = scan(terms.review, true);
  if (defer.length) return { verdict: "REVIEW", reasons: [...defer, ...review], deferFetch: true };

  if (review.length) return { verdict: "REVIEW", reasons: review, deferFetch: false };
  return { verdict: "CLEAN", reasons: [], deferFetch: false };
}
