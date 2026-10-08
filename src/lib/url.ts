/** Build /path?query from the current search params plus a patch. Undefined / empty values are removed. */
export function withQuery(base: string, current: Record<string, string | undefined>, patch: Record<string, string | number | undefined> = {}): string {
  const merged: Record<string, string | undefined> = { ...current };
  for (const [k, v] of Object.entries(patch)) merged[k] = v === undefined || v === "" ? undefined : String(v);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** Postgres rejects NUL bytes in text, so one ?q=%00 would otherwise be a 500. */
export const stripNul = (s: string) => s.replace(/\u0000/g, "");

/** Search params -> a flat string record (first value wins, NUL bytes removed). */
export function flatParams(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    const one = Array.isArray(v) ? v[0] : v;
    out[k] = one === undefined ? undefined : stripNul(one);
  }
  return out;
}

/** Largest value a Postgres int column holds: anything bigger in a query is an error, not "no match". */
export const MAX_INT = 2_147_483_647;

/** "1234", "#1234" or a pasted address like https://site/g/1234-some-title-2 -> "1234". Never glues unrelated digits together. */
export function workNumber(input: string): string | undefined {
  const s = input.trim();
  const fromLink = s.match(/\/(?:g|read)\/(\d{1,10})(?:\D|$)/);
  if (fromLink) return fromLink[1];
  const plain = s.match(/^#?\s*(\d{1,10})$/);
  return plain ? plain[1] : undefined;
}

/** A positive database id from user input, or null. */
export function idParam(v: string | number | undefined | null): number | null {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  return Number.isInteger(n) && n > 0 && n <= MAX_INT ? n : null;
}

export const intParam = (v: string | undefined, dflt = 1, min = 1, max = 100_000) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
