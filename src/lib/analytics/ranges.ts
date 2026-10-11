/** Date ranges and series for the analytics report. Pure, so the arithmetic that decides what a number means can be tested. */
export const RANGES = ["today", "7d", "30d", "90d"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_LABEL: Record<Range, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };
export const RANGE_VS: Record<Range, string> = { today: "yesterday so far", "7d": "the 7 days before", "30d": "the 30 days before", "90d": "the 90 days before" };

export const parseRange = (v: unknown): Range => (RANGES as readonly string[]).includes(v as string) ? (v as Range) : "7d";

const DAY = 86_400_000;
const startOfUtcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export interface Bounds {
  from: Date;
  to: Date;
  /** the same stretch of time, one span earlier: what the numbers are compared with */
  prevFrom: Date;
  prevTo: Date;
  /** one bucket per hour (today) instead of per day */
  hourly: boolean;
  days: number;
}

/**
 * "Last 7 days" is today (so far) and the six UTC days before it. The comparison period is the same length shifted back, cut
 * at the same moment, so a half-finished day is compared with the same half of the earlier one, never with a whole day.
 */
export function bounds(range: Range, now: Date = new Date()): Bounds {
  const days = range === "today" ? 1 : Number.parseInt(range, 10);
  const from = new Date(startOfUtcDay(now) - (days - 1) * DAY);
  const shift = days * DAY;
  return { from, to: now, prevFrom: new Date(from.getTime() - shift), prevTo: new Date(now.getTime() - shift), hourly: range === "today", days };
}

export interface Point {
  /** "2026-10-11" or, for the hourly view, "2026-10-11 14" */
  key: string;
  pageviews: number;
  visitors: number;
}

const two = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;

/** Every bucket from `from` to `to`, zero where nothing happened, so a quiet day is a dip in the chart and not a missing bar. */
export function fillSeries(rows: { key: string; pageviews: number; visitors: number }[], b: Pick<Bounds, "from" | "to" | "hourly">): Point[] {
  const have = new Map(rows.map((r) => [r.key, r]));
  const out: Point[] = [];
  const step = b.hourly ? 3_600_000 : DAY;
  const first = b.hourly ? Math.floor(b.from.getTime() / step) * step : b.from.getTime();
  for (let t = first; t <= b.to.getTime(); t += step) {
    const d = new Date(t);
    const key = b.hourly ? `${dayKey(d)} ${two(d.getUTCHours())}` : dayKey(d);
    const r = have.get(key);
    out.push({ key, pageviews: r?.pageviews ?? 0, visitors: r?.visitors ?? 0 });
  }
  return out;
}

/** Change against the earlier period as a percentage; null when there is nothing to compare with (never "infinity"). */
export function change(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before <= 0) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/** n out of total as a percentage with one decimal; 0 when total is 0. */
export const pct = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

/** 75th percentile of a list (nearest-rank), the number Google reports for Core Web Vitals. */
export function p75(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(0.75 * s.length) - 1)]!;
}

/** Seconds as "1m 05s", "42s", "1h 02m"; "-" when unknown. */
export function clock(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "-";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${two(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${two(Math.floor((s % 3600) / 60))}m`;
}
