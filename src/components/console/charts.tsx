import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Point } from "@/lib/analytics/ranges";

/**
 * Page views as bars with unique visitors as a line on top, in plain SVG (no chart library to load). The same numbers are
 * available to screen readers as a table, and each bar has a hover title.
 */
export function Trend({ data, hourly, label }: { data: Point[]; hourly: boolean; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.pageviews));
  const total = data.reduce((s, d) => s + d.pageviews, 0);
  const W = 100 / Math.max(1, data.length);
  const h = (n: number) => (n === 0 ? 0.6 : Math.max(0.8, (n / max) * 37));
  const y = (n: number) => 40 - h(n);
  const line = data.map((d, i) => `${(i * W + W / 2).toFixed(2)},${y(d.visitors).toFixed(2)}`).join(" ");
  const name = (k: string) => (hourly ? `${k.slice(11)}:00` : k);
  return (
    <figure>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full sm:h-52 xl:h-64" role="img" aria-label={`${label}: ${total.toLocaleString()} page views`}>
        {[10, 20, 30].map((v) => (
          <line key={v} x1="0" x2="100" y1={v} y2={v} stroke="currentColor" className="text-line" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => (
          <rect key={d.key} x={i * W + W * 0.12} width={W * 0.76} y={y(d.pageviews)} height={h(d.pageviews)} rx="0.5" className={d.pageviews ? "fill-accent/70" : "fill-surface-3"}>
            <title>{`${name(d.key)}: ${d.pageviews.toLocaleString()} page views, ${d.visitors.toLocaleString()} visitors`}</title>
          </rect>
        ))}
        {data.length > 1 && <polyline points={line} fill="none" stroke="currentColor" className="text-info" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted">
        <span>{data[0] ? name(data[0].key).slice(hourly ? 0 : 5) : ""}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent/70" aria-hidden="true" />Page views (peak {max.toLocaleString()})</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-info" aria-hidden="true" />Visitors</span>
        </span>
        <span>{data.length ? name(data[data.length - 1]!.key).slice(hourly ? 0 : 5) : ""}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>{hourly ? "Hour (UTC)" : "Day (UTC)"}</th><th>Page views</th><th>Visitors</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}><td>{name(d.key)}</td><td>{d.pageviews}</td><td>{d.visitors}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Page views by hour of the day (UTC), to see when the readers are there. */
export function HourBars({ hours }: { hours: { hour: number; views: number }[] }) {
  const max = Math.max(1, ...hours.map((h) => h.views));
  const total = hours.reduce((s, h) => s + h.views, 0);
  return (
    <figure>
      <svg viewBox="0 0 96 30" preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label={`Page views by hour of the day, UTC: ${total.toLocaleString()} in total`}>
        {hours.map((h) => {
          const bar = h.views === 0 ? 0.6 : Math.max(1, (h.views / max) * 28);
          return (
            <rect key={h.hour} x={h.hour * 4 + 0.6} width={2.8} y={30 - bar} height={bar} rx="0.5" className={h.views ? "fill-accent/70" : "fill-surface-3"}>
              <title>{`${String(h.hour).padStart(2, "0")}:00 UTC: ${h.views.toLocaleString()}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted">
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00 UTC</span>
      </figcaption>
    </figure>
  );
}

/** "up 12.5%" against the earlier period. When it is bad for the number to rise (bounce rate), `lowerIsBetter` flips the colours. */
export function Delta({ value, lowerIsBetter = false, vs }: { value: number | null; lowerIsBetter?: boolean; vs: string }) {
  if (value == null) return <span className="text-muted">no data for {vs}</span>;
  if (value === 0) return <span className="inline-flex items-center gap-1 text-muted"><Minus className="h-3 w-3" aria-hidden="true" />same as {vs}</span>;
  const up = value > 0;
  const good = up !== lowerIsBetter;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${good ? "text-good" : "text-bad"}`}>
      {up ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
      {up ? "up" : "down"} {Math.abs(value)}%<span className="font-normal text-muted"> vs {vs}</span>
    </span>
  );
}
