/**
 * Core Web Vitals thresholds, as published by Google (web.dev/vitals): a value up to `good` is good, up to `poor` needs
 * improvement, above that is poor. Stored values are milliseconds, except CLS which is stored times 1000.
 */
export const VITAL_INFO: Record<string, { name: string; good: number; poor: number; unit: "ms" | "cls"; about: string }> = {
  LCP: { name: "Largest Contentful Paint", good: 2500, poor: 4000, unit: "ms", about: "when the main content is visible" },
  INP: { name: "Interaction to Next Paint", good: 200, poor: 500, unit: "ms", about: "how quickly the page answers a tap or click" },
  CLS: { name: "Cumulative Layout Shift", good: 100, poor: 250, unit: "cls", about: "how much the page jumps while loading" },
  FCP: { name: "First Contentful Paint", good: 1800, poor: 3000, unit: "ms", about: "when anything first appears" },
  TTFB: { name: "Time to First Byte", good: 800, poor: 1800, unit: "ms", about: "how long the server took to answer" },
};

export type Rating = "good" | "needs-improvement" | "poor";

export function rate(metric: string, value: number | null): Rating | null {
  const i = VITAL_INFO[metric];
  if (!i || value == null) return null;
  return value <= i.good ? "good" : value <= i.poor ? "needs-improvement" : "poor";
}

export function formatVital(metric: string, value: number | null): string {
  const i = VITAL_INFO[metric];
  if (!i || value == null) return "-";
  if (i.unit === "cls") return (value / 1000).toFixed(2);
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}
