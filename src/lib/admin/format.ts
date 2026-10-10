/** Small, pure formatting helpers for the admin console (no database, so each is unit-tested). */

/** "just now", "5m ago", "3h ago", "2d ago", then a date. `now` is a parameter so tests are exact. */
export function ago(date: Date | string | number | null | undefined, now = Date.now()): string {
  if (date == null) return "never";
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

/** 1536 -> "1.5 KB", 3_200_000_000 -> "3.0 GB". */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** "2026-10-09 14:20" in UTC (the console always shows UTC, so two admins read the same time). */
export const stamp = (d: Date | string | number): string => new Date(d).toISOString().slice(0, 16).replace("T", " ");

/** How long a run took: "42s", "6m 05s", "1h 12m". */
export function duration(from: Date | string | number, to: Date | string | number | null | undefined): string {
  if (to == null) return "running";
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

/** Bar widths in percent, relative to the largest value; a non-zero value never rounds down to an invisible sliver. */
export function barWidths(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max <= 0 || v <= 0 ? 0 : Math.max(3, Math.round((v / max) * 100))));
}

/**
 * Fill a "count per day" series so every one of the last `days` days has a value (0 when nothing happened), oldest first.
 * `rows` carry a YYYY-MM-DD day; `today` is a parameter so tests are exact.
 */
export function dayBuckets(rows: { day: string; n: number }[], days: number, today = new Date()): { day: string; n: number }[] {
  const byDay = new Map(rows.map((r) => [r.day.slice(0, 10), r.n]));
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day, n: byDay.get(day) ?? 0 };
  });
}

/** "me.minhajrahman@gmail.com" -> "MM"; "alex@x.com" -> "A". */
export function initials(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/[^a-zA-Z0-9]+/g, " ").trim();
  const parts = local.split(" ").filter(Boolean);
  const out = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 1);
  return out.toUpperCase();
}

/** The part of a safety reason after its "tag:" / "title:" prefix, and which field matched. */
export function reasonParts(reason: string): { field: string; term: string } {
  const i = reason.indexOf(":");
  return i < 0 ? { field: "", term: reason } : { field: reason.slice(0, i), term: reason.slice(i + 1) };
}
