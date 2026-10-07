import { ALLOWED_CONTEXT, DEFER_TERMS, QUARANTINE_TERMS, REVIEW_TERMS } from "./terms";

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

const allowed = ALLOWED_CONTEXT.map((p) => norm(p));

/** Blank out allow-listed phrases so the words inside them cannot trigger a term. */
function maskAllowed(n: string): string {
  let out = n;
  for (const a of allowed) out = out.split(a).join(" ");
  return out;
}

function hits(haystack: string, terms: string[]): string[] {
  const h = maskAllowed(haystack);
  return terms.filter((t) => h.includes(norm(t)));
}

export function classify(input: SafetyInput): SafetyResult {
  const named = [input.title, ...(input.altTitles ?? [])];
  const scan = (terms: string[], withDescription: boolean) => {
    const found: string[] = [];
    for (const tag of input.tags) for (const t of hits(norm(tag), terms)) found.push(`tag:${t}`);
    for (const title of named) for (const t of hits(norm(title), terms)) found.push(`title:${t}`);
    if (withDescription && input.description)
      for (const t of hits(norm(input.description), terms)) found.push(`description:${t}`);
    return [...new Set(found)];
  };

  // QUARANTINE: tags + titles only (never the description)
  const quarantine = scan(QUARANTINE_TERMS, false);
  if (quarantine.length) return { verdict: "QUARANTINE", reasons: quarantine, deferFetch: false };

  // DEFER: explicit age markers in tags + titles. Held without downloading anything.
  const defer = scan(DEFER_TERMS, false);
  const review = scan(REVIEW_TERMS, true);
  if (defer.length) return { verdict: "REVIEW", reasons: [...defer, ...review], deferFetch: true };

  if (review.length) return { verdict: "REVIEW", reasons: review, deferFetch: false };
  return { verdict: "CLEAN", reasons: [], deferFetch: false };
}
