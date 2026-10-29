import type { HistoryPoint } from "@/lib/admin/vps";

/**
 * A day of one measurement as a small line chart in plain SVG (0-100 %, so a flat low line really means idle). The
 * numbers are also there for screen readers as the caption. `now` is a parameter so the x axis is the last 24 hours.
 */
export function Spark({ points, pick, label, className = "text-accent", now }: { points: HistoryPoint[]; pick: (p: HistoryPoint) => number; label: string; className?: string; now: number }) {
  const span = 24 * 3600_000;
  const shown = points.filter((p) => p.t >= now - span);
  const x = (t: number) => ((t - (now - span)) / span) * 100;
  const y = (v: number) => 30 - Math.min(100, Math.max(0, v)) * 0.3;
  const line = shown.map((p) => `${x(p.t).toFixed(2)},${y(pick(p)).toFixed(2)}`).join(" ");
  const last = shown[shown.length - 1];
  const peak = shown.reduce((m, p) => Math.max(m, pick(p)), 0);
  return (
    <figure>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-14 w-full" role="img" aria-label={`${label}, last 24 hours${last ? `: now ${Math.round(pick(last))}%, peak ${Math.round(peak)}%` : ": no data yet"}`}>
        {[7.5, 15, 22.5].map((v) => (
          <line key={v} x1="0" x2="100" y1={v} y2={v} stroke="currentColor" className="text-line" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
        ))}
        {shown.length > 1 && <polyline points={line} fill="none" stroke="currentColor" className={className} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] tabular-nums text-muted">
        <span>{label}</span>
        <span>{last ? `now ${Math.round(pick(last))}% · peak ${Math.round(peak)}%` : "no data yet"}</span>
      </figcaption>
    </figure>
  );
}
