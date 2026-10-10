import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { retryFailedChapters } from "@/lib/admin/actions";
import type { RunDetail, RunsData } from "@/lib/admin/types";
import { ago, duration, stamp } from "@/lib/admin/format";
import { ActionButton } from "../ActionForm";
import { Badge, Card, Empty, PageHeader, SectionTitle, Stat } from "../ui";

function status(r: RunDetail) {
  return !r.finishedAt ? { tone: "warn" as const, label: "running" } : r.ok ? { tone: "good" as const, label: "ok" } : { tone: "bad" as const, label: `${r.errors.length} error${r.errors.length === 1 ? "" : "s"}` };
}

function Errors({ r }: { r: RunDetail }) {
  if (!r.errors.length) return null;
  return (
    <details className="mt-2">
      <summary className="c-tap cursor-pointer text-xs font-semibold text-bad hover:underline">Show {r.errors.length} error{r.errors.length === 1 ? "" : "s"}</summary>
      <ul className="mt-2 space-y-1 rounded-lg bg-bad/5 p-2.5 font-mono text-[11px] leading-relaxed text-muted">
        {r.errors.slice(0, 8).map((e, i) => <li key={i} className="break-words">{e}</li>)}
        {r.errors.length > 8 && <li>… and {r.errors.length - 8} more</li>}
      </ul>
    </details>
  );
}

function RunCard({ r }: { r: RunDetail }) {
  const s = status(r);
  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{r.site} <span className="font-normal text-muted">· {r.mode}</span></p>
          <p className="text-xs text-muted">{ago(r.startedAt)} · {duration(r.startedAt, r.finishedAt)}</p>
        </div>
        <Badge tone={s.tone} dot>{s.label}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[["Seen", r.seen], ["New", r.created], ["Chapters", r.chapters], ["Pages", r.pages]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-surface-2/60 px-1 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{k}</dt>
            <dd className="mt-0.5 text-[13px] font-bold tabular-nums">{(v as number).toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <Errors r={r} />
    </li>
  );
}

export function RunsView({ d }: { d: RunsData }) {
  const ok = d.runs.filter((r) => r.finishedAt && r.ok).length;
  const bad = d.runs.filter((r) => r.finishedAt && !r.ok).length;
  const running = d.runs.filter((r) => !r.finishedAt).length;
  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Ingest runs" description="The importers run on a schedule. This is what each recent run did, and what failed." />
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Recent runs" value={d.runs.length} icon={<Activity className="h-4 w-4" />} tone="info" sub="the last 30" />
          <Stat label="Succeeded" value={ok} icon={<CheckCircle2 className="h-4 w-4" />} tone="good" sub={running ? `${running} running now` : "none running"} />
          <Stat label="With errors" value={bad} icon={<AlertTriangle className="h-4 w-4" />} tone={bad ? "bad" : "muted"} sub={bad ? "open the run to see them" : "all clean"} />
          <Stat label="Failed chapters" value={d.failedCount} icon={<RefreshCw className="h-4 w-4" />} tone={d.failedCount ? "warn" : "muted"} sub="waiting for a retry" href="#failed" />
        </div>

        {d.runs.length ? (
          <>
            {/* a phone gets a card per run; a wide screen gets one dense table */}
            <Card pad={false} className="md:hidden"><ul className="c-divide">{d.runs.map((r) => <RunCard key={r.id} r={r} />)}</ul></Card>
            <Card pad={false} className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <th scope="col" className="px-4 py-3">Run</th>
                    <th scope="col" className="px-3 py-3">Started</th>
                    <th scope="col" className="px-3 py-3 text-right">Seen</th>
                    <th scope="col" className="px-3 py-3 text-right">New</th>
                    <th scope="col" className="px-3 py-3 text-right">Held</th>
                    <th scope="col" className="px-3 py-3 text-right">Quarantined</th>
                    <th scope="col" className="px-3 py-3 text-right">Chapters</th>
                    <th scope="col" className="px-3 py-3 text-right">Pages</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="c-divide">
                  {d.runs.map((r) => {
                    const s = status(r);
                    return (
                      <tr key={r.id} className="align-top transition hover:bg-surface-2/40">
                        <td className="px-4 py-3 font-semibold">{r.site}<span className="font-normal text-muted"> · {r.mode}</span></td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted" title={stamp(r.startedAt) + " UTC"}>{ago(r.startedAt)}<span className="block text-[11px]">{duration(r.startedAt, r.finishedAt)}</span></td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.seen.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">{r.created.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted">{r.held.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted">{r.quarantined.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.chapters.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.pages.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <Badge tone={s.tone} dot>{s.label}</Badge>
                          <Errors r={r} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </>
        ) : (
          <Empty icon={<Activity className="h-5 w-5" />} title="No runs yet" hint="The first scheduled run will show up here." />
        )}
      </div>

      <section id="failed" aria-label="Failed chapters" className="scroll-mt-24">
        <SectionTitle
          hint="A chapter that fails 6 times stops being retried by itself. Retry all puts every failed chapter back in the queue for the next run."
          action={d.failedCount > 0 ? <ActionButton label="Retry all" tone="primary" icon={<RefreshCw className="h-3.5 w-3.5" />} confirm={{ title: "Retry every failed chapter?", message: `${d.failedCount.toLocaleString()} chapters go back in the queue for the next ingest run.`, confirmLabel: "Retry all" }} action={retryFailedChapters} /> : undefined}
        >
          Failed chapters <span className="font-normal text-muted">({d.failedCount.toLocaleString()})</span>
        </SectionTitle>
        {d.failed.length ? (
          <Card pad={false}>
            <ul className="c-divide">
              {d.failed.map((c) => (
                <li key={c.id} className="space-y-1.5 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/console/works?q=${c.publicId}`} className="c-tap rounded-md bg-surface-2 px-2 text-[11px] font-semibold text-muted transition hover:text-accent">#{c.publicId}</Link>
                    <Badge tone="info">{c.language}</Badge>
                    <span className="text-xs text-muted">chapter {c.number} · {c.attempts} attempt{c.attempts === 1 ? "" : "s"}</span>
                  </div>
                  <p className="truncate text-[13px] font-semibold" title={c.title}>{c.title}</p>
                  {c.error && <p className="break-words font-mono text-[11px] leading-relaxed text-bad/90">{c.error}</p>}
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Empty icon={<CheckCircle2 className="h-5 w-5" />} title="No failed chapters" hint="Everything that was queued has been fetched." />
        )}
      </section>
    </div>
  );
}
