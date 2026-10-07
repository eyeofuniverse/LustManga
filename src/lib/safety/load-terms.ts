import { prisma, db } from "@/lib/db";
import { DEFAULT_TERMS, type TermSet } from "./classify";

let cache: { at: number; terms: TermSet } | null = null;
const TTL_MS = 60_000;

/**
 * The live term lists from the database (admin-edited). Falls back to the
 * built-in defaults if the table is empty or unreachable. Core quarantine terms
 * are unioned in by classify() regardless.
 */
export async function loadTerms(force = false): Promise<TermSet> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.terms;
  let terms = DEFAULT_TERMS;
  try {
    const rows = await db(() => prisma.safetyTerm.findMany({ select: { term: true, tier: true } }));
    if (rows.length) {
      const pick = (tier: string) => rows.filter((r) => r.tier === tier).map((r) => r.term);
      terms = {
        quarantine: pick("QUARANTINE"),
        defer: pick("DEFER"),
        review: pick("REVIEW"),
        allowed: pick("ALLOWED"),
      };
    }
  } catch {
    /* keep defaults */
  }
  cache = { at: Date.now(), terms };
  return terms;
}
