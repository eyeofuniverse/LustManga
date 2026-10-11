import Link from "next/link";
import { RANGES, type Range } from "@/lib/analytics/ranges";

/** A "Today / 7 days / 30 days / 90 days" switch made of links, so the choice lives in the address. */
export function RangeNav({ base, range, label = "Time range" }: { base: string; range: Range; label?: string }) {
  return (
    <nav aria-label={label} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
      {RANGES.map((r) => (
        <Link key={r} href={`${base}${base.includes("?") ? "&" : "?"}range=${r}`} className="c-tab" aria-current={r === range ? "page" : undefined}>
          {r === "today" ? "Today" : r.replace("d", " days")}
        </Link>
      ))}
    </nav>
  );
}
