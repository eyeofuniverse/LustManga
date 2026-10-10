import Link from "next/link";
import { ScrollText } from "lucide-react";
import type { AuditData, AuditRow } from "@/lib/admin/types";
import { ago, initials, stamp } from "@/lib/admin/format";
import { Badge, Card, Empty, PageHeader, SearchField, type Tone } from "../ui";

/** The verb at the end of "work.reject" / "tag.merge" decides the colour: destructive reads red, publishing reads green. */
function toneOf(action: string): Tone {
  const verb = action.split(".").pop() ?? action;
  if (/(reject|delete|remove|purge|takedown)/.test(verb)) return "bad";
  if (/(approve|publish|create|add|confirm|resolve|merge)/.test(verb)) return "good";
  if (/(login|logout|enrol|bootstrap)/.test(verb)) return "info";
  return "muted";
}

function Entry({ r }: { r: AuditRow }) {
  const hasDiff = r.diff != null && !(typeof r.diff === "object" && Object.keys(r.diff as object).length === 0);
  return (
    <li className="flex gap-3 p-3.5 sm:gap-4 sm:p-4">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-extrabold text-muted" aria-hidden="true">
        {r.actor ? initials(r.actor) : "SYS"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Badge tone={toneOf(r.action)}>{r.action}</Badge>
          <span className="text-[13px] text-muted">
            <span className="font-medium text-text">{r.targetType}</span> <span className="font-mono text-xs">{r.targetId}</span>
          </span>
          <time className="ml-auto text-xs tabular-nums text-muted" dateTime={new Date(r.at).toISOString()} title={`${stamp(r.at)} UTC`}>{ago(r.at)}</time>
        </div>
        <p className="mt-1 truncate text-xs text-muted" title={r.actor ?? "system"}>by {r.actor ?? "system"}</p>
        {hasDiff && (
          <details className="mt-1.5">
            <summary className="c-tap cursor-pointer text-xs font-semibold text-muted hover:text-text">Details</summary>
            <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-bg/60 p-2.5 font-mono text-[11px] leading-relaxed text-muted ring-1 ring-inset ring-line">{JSON.stringify(r.diff, null, 2)}</pre>
          </details>
        )}
      </div>
    </li>
  );
}

export function AuditView({ d }: { d: AuditData }) {
  return (
    <div>
      <PageHeader title="Audit log" description="Every change made in this console: who, what and when. The latest 200 entries; times are UTC, hover for the exact moment." />
      <form action="/console/audit" className="mb-5 flex gap-2">
        <SearchField name="q" defaultValue={d.q} placeholder="Filter by action, person or id" className="flex-1" />
        <button className="c-btn-primary">Filter</button>
        {d.q && <Link href="/console/audit" className="c-btn-default">Clear</Link>}
      </form>
      {d.rows.length ? (
        <Card pad={false}>
          <ul className="c-divide">{d.rows.map((r) => <Entry key={r.id} r={r} />)}</ul>
        </Card>
      ) : (
        <Empty icon={<ScrollText className="h-5 w-5" />} title={d.q ? "No entries match" : "Nothing yet"} hint={d.q ? "Try a different filter." : "Changes made in the console are recorded here."} />
      )}
    </div>
  );
}
