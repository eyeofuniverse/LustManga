/** Build /path?query from the current search params plus a patch. Undefined / empty values are removed. */
export function withQuery(base: string, current: Record<string, string | undefined>, patch: Record<string, string | number | undefined> = {}): string {
  const merged: Record<string, string | undefined> = { ...current };
  for (const [k, v] of Object.entries(patch)) merged[k] = v === undefined || v === "" ? undefined : String(v);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** Search params -> a flat string record (first value wins). */
export function flatParams(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

export const intParam = (v: string | undefined, dflt = 1, min = 1, max = 100_000) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
