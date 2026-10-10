import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import { barWidths } from "@/lib/admin/format";

/** Presentation building blocks for every console screen. No hooks and no data access, so they render anywhere. */

export type Tone = "good" | "warn" | "bad" | "info" | "accent" | "muted";

const BADGE: Record<Tone, string> = {
  good: "c-badge-good",
  warn: "c-badge-warn",
  bad: "c-badge-bad",
  info: "c-badge-info",
  accent: "c-badge-accent",
  muted: "c-badge-muted",
};
const TEXT: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", info: "text-info", accent: "text-accent", muted: "text-muted" };
const FILL: Record<Tone, string> = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", info: "bg-info", accent: "bg-accent", muted: "bg-muted" };

export function Badge({ tone = "muted", children, dot = false }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={BADGE[tone]}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${FILL[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** published / draft / rejected as a badge with the colour readers will learn once and recognise everywhere */
export function PublishBadge({ state }: { state: string }) {
  const tone: Tone = state === "PUBLISHED" ? "good" : state === "REJECTED" ? "bad" : "warn";
  return (
    <Badge tone={tone} dot>
      {state.toLowerCase()}
    </Badge>
  );
}

export function PageHeader({
  title,
  description,
  count,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  count?: number | string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mb-7">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">
          {title}
          {count !== undefined && <span className="ml-2.5 align-middle text-base font-semibold text-muted">{typeof count === "number" ? count.toLocaleString() : count}</span>}
        </h1>
        {description && <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "", edge, pad = true }: { children: React.ReactNode; className?: string; edge?: Tone; pad?: boolean }) {
  const colour = edge ? { good: "rgb(var(--good))", warn: "rgb(var(--warn))", bad: "rgb(var(--bad))", info: "rgb(var(--info))", accent: "rgb(var(--accent))", muted: "rgb(var(--muted))" }[edge] : undefined;
  return (
    <div className={`c-card ${edge ? "c-edge" : ""} ${pad ? "c-card-pad" : ""} ${className}`} style={colour ? ({ ["--edge" as string]: colour } as React.CSSProperties) : undefined}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint, action }: { children: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-base font-bold tracking-tight">{children}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** A headline number with a label, an icon and a line of context. A link when `href` is given. */
export function Stat({
  label,
  value,
  sub,
  icon,
  tone = "muted",
  href,
  className = "",
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
        {icon && <span className={`grid h-8 w-8 place-items-center rounded-lg bg-surface-2 ${TEXT[tone]}`}>{icon}</span>}
      </div>
      <div className="mt-2 font-display text-[26px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[30px]">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </>
  );
  const cls = `c-card c-card-pad block transition ${className}`;
  return href ? (
    <Link href={href} className={`${cls} hover:border-accent/40 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Horizontal bars for a short ranked list (languages, sources). */
export function BarList({ rows, tone = "accent", empty = "Nothing yet" }: { rows: { label: string; value: number; href?: string }[]; tone?: Tone; empty?: string }) {
  if (!rows.length) return <p className="py-4 text-center text-xs text-muted">{empty}</p>;
  const widths = barWidths(rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => {
        const label = (
          <span className="min-w-0 flex-1 truncate text-[13px]" title={r.label}>
            {r.label}
          </span>
        );
        return (
          <li key={r.label} className="flex items-center gap-3">
            {r.href ? (
              <Link href={r.href} className="flex min-w-0 basis-28 items-center hover:text-accent sm:basis-32">
                {label}
              </Link>
            ) : (
              <span className="flex min-w-0 basis-28 items-center sm:basis-32">{label}</span>
            )}
            <span className="relative h-2 flex-[2] overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${r.label}: ${r.value.toLocaleString()}`}>
              <span className={`absolute inset-y-0 left-0 rounded-full ${FILL[tone]}`} style={{ width: `${widths[i]}%` }} />
            </span>
            <span className="w-14 text-right text-xs tabular-nums text-muted">{r.value.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Segmented tabs made of links, so the state lives in the URL. Scrolls sideways on a narrow screen instead of wrapping. */
export function Tabs({ items }: { items: { href: string; label: string; count?: number; active: boolean }[] }) {
  return (
    <nav aria-label="Sections" className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
        {items.map((t) => (
          <Link key={t.href} href={t.href} className="c-tab" aria-current={t.active ? "page" : undefined}>
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-md px-1.5 text-[11px] tabular-nums ${t.active ? "bg-accent-fill text-white" : "bg-surface-3/60 text-muted"}`}>{t.count.toLocaleString()}</span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Pager({ page, pages, href, total, pageSize }: { page: number; pages: number; href: (n: number) => string; total?: number; pageSize?: number }) {
  if (pages <= 1) return null;
  const from = total && pageSize ? (page - 1) * pageSize + 1 : null;
  const to = total && pageSize ? Math.min(total, page * pageSize) : null;
  return (
    <nav aria-label="Pagination" className="mt-5 flex items-center justify-between gap-3">
      <p className="text-xs text-muted">
        {from !== null && to !== null ? (
          <>
            <span className="tabular-nums">{from.toLocaleString()}–{to.toLocaleString()}</span> of <span className="tabular-nums">{total!.toLocaleString()}</span>
          </>
        ) : (
          <>Page {page} of {pages}</>
        )}
      </p>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={href(page - 1)} className="c-btn-default" rel="prev">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Prev
          </Link>
        ) : (
          <button type="button" disabled className="c-btn-default"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Prev</button>
        )}
        <span className="px-2 text-xs tabular-nums text-muted">{page} / {pages}</span>
        {page < pages ? (
          <Link href={href(page + 1)} className="c-btn-default" rel="next">
            Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <button type="button" disabled className="c-btn-default">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        )}
      </div>
    </nav>
  );
}

export function Empty({ title, hint, icon, action }: { title: string; hint?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="c-card flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon ?? <Inbox className="h-5 w-5" aria-hidden="true" />}</span>
      <p className="font-display text-base font-bold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A cover thumbnail with a graceful blank when there is none. */
export function Cover({ src, w = 48, h = 68, className = "" }: { src: string | null | undefined; w?: number; h?: number; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" width={w} height={h} className={`shrink-0 rounded-lg bg-surface-2 object-cover ring-1 ring-line ${className}`} style={{ width: w, height: h }} />
  ) : (
    <div className={`grid shrink-0 place-items-center rounded-lg bg-surface-2 text-[10px] text-muted ring-1 ring-line ${className}`} style={{ width: w, height: h }} aria-hidden="true">
      none
    </div>
  );
}

/** A tiny bar chart of one count per day, as inline SVG (no chart library, so it costs nothing to load). */
export function DayBars({ data, tone = "accent", label }: { data: { day: string; n: number }[]; tone?: Tone; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((s, d) => s + d.n, 0);
  const W = 100 / data.length;
  return (
    <figure>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-36 w-full sm:h-44 xl:h-72" role="img" aria-label={`${label}: ${total.toLocaleString()} in the last ${data.length} days`}>
        {[10, 20, 30].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" className="text-line" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => {
          const h = d.n === 0 ? 0.6 : Math.max(1.2, (d.n / max) * 38);
          return (
            <rect key={d.day} x={i * W + W * 0.14} width={W * 0.72} y={40 - h} height={h} rx="0.6" className={d.n === 0 ? "fill-surface-3" : tone === "accent" ? "fill-accent" : "fill-info"}>
              <title>{`${d.day}: ${d.n.toLocaleString()}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted">
        <span>{data[0]?.day.slice(5)}</span>
        <span>peak {max.toLocaleString()}</span>
        <span>{data.at(-1)?.day.slice(5)}</span>
      </figcaption>
    </figure>
  );
}

/** A stacked proportion bar with a legend: how a whole splits into a few states. */
export function Split({ parts }: { parts: { label: string; value: number; tone: Tone }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={parts.map((p) => `${p.label} ${p.value.toLocaleString()}`).join(", ")}>
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className={FILL[p.tone]} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 shrink-0 rounded-full ${FILL[p.tone]}`} aria-hidden="true" />
            <span className="truncate text-muted">{p.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{p.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An explanatory note: what a screen's actions do, in a tinted box that is calmer than a card. */
export function Note({ tone = "info", icon, children }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode }) {
  const ring = { good: "bg-good/5 ring-good/20", warn: "bg-warn/5 ring-warn/20", bad: "bg-bad/5 ring-bad/20", info: "bg-info/5 ring-info/20", accent: "bg-accent/5 ring-accent/20", muted: "bg-surface-2/60 ring-line" }[tone];
  return (
    <div className={`mb-5 flex gap-3 rounded-xl p-3.5 text-[13px] leading-relaxed text-muted ring-1 ring-inset ${ring}`}>
      {icon && <span className={`mt-0.5 shrink-0 ${TEXT[tone]}`}>{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Why the safety check flagged something: the field it matched in, and the term. */
export function ReasonBadges({ reasons, tone = "warn" }: { reasons: string[]; tone?: Tone }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Why it was flagged">
      {reasons.map((r) => {
        const i = r.indexOf(":");
        return (
          <li key={r}>
            <Badge tone={tone}>
              {i > 0 && <span className="font-normal underline decoration-current/40 underline-offset-2">{r.slice(0, i)}</span>}
              {i > 0 ? r.slice(i + 1) : r}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** Filter-bar building blocks: a search field with an icon, and a select that matches it. */
export function SearchField({ name, defaultValue, placeholder, className = "" }: { name: string; defaultValue?: string; placeholder: string; className?: string }) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} className="c-input pl-9" />
    </label>
  );
}

export function SelectField({ name, label, defaultValue, children, className = "" }: { name: string; label: string; defaultValue?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="sr-only">{label}</span>
      <select name={name} defaultValue={defaultValue} className="c-input appearance-none bg-[length:16px] pr-8">
        {children}
      </select>
    </label>
  );
}
