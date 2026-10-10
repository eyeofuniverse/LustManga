import Link from "next/link";
import { CheckCircle2, ExternalLink, Flag, Mail, RotateCcw, XCircle } from "lucide-react";
import { setReportStatus } from "@/lib/admin/actions";
import type { ReportsData } from "@/lib/admin/types";
import { ago, stamp } from "@/lib/admin/format";
import { ActionButton } from "../ActionForm";
import { Badge, Empty, Note, PageHeader, Tabs, type Tone } from "../ui";

const KIND: Record<string, { label: string; tone: Tone }> = {
  DMCA: { label: "Copyright / takedown", tone: "bad" },
  BROKEN: { label: "Broken pages", tone: "warn" },
  OTHER: { label: "Other", tone: "info" },
};
const EDGE: Record<Tone, string> = { good: "--good", warn: "--warn", bad: "--bad", info: "--info", accent: "--accent", muted: "--muted" };

export function ReportsView({ d }: { d: ReportsData }) {
  return (
    <div>
      <PageHeader title="Reports" description="Sent from the public report form. Copyright requests come first because they are time-sensitive." />
      <Tabs
        items={[
          { href: "/console/reports", label: "Open", count: d.open, active: d.status === "open" },
          { href: "/console/reports?status=closed", label: "Closed", count: d.closed, active: d.status === "closed" },
        ]}
      />
      {d.status === "open" && d.rows.some((r) => r.kind === "DMCA") && (
        <Note tone="bad" icon={<Flag className="h-4 w-4" />}>There are copyright requests waiting. Reply promptly: the takedown page promises it.</Note>
      )}

      {d.rows.length ? (
        <div className="space-y-4">
          {d.rows.map((r) => {
            const k = KIND[r.kind] ?? KIND.OTHER;
            return (
              <article key={r.id} className="c-card c-edge overflow-hidden" style={{ ["--edge" as string]: `rgb(var(${EDGE[k.tone]}))` }}>
                <div className="space-y-3 p-4 pl-5 sm:p-5 sm:pl-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={k.tone}>{k.label}</Badge>
                    <time className="text-xs text-muted" dateTime={new Date(r.createdAt).toISOString()} title={stamp(r.createdAt) + " UTC"}>{ago(r.createdAt)}</time>
                    {r.status !== "OPEN" && <Badge tone="muted">{r.status.toLowerCase()}</Badge>}
                    {r.workId && (
                      <span className="ml-auto flex items-center gap-1">
                        <Link href={`/console/works?q=${r.workId}`} className="c-btn-ghost">Work #{r.workId}</Link>
                        <a href={`/g/${r.workId}`} target="_blank" rel="noreferrer noopener" className="c-btn-ghost">
                          Public page <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{r.details}</p>
                  {r.contact && (
                    <p className="flex items-center gap-2 text-[13px] text-muted">
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      <a className="underline decoration-line underline-offset-2 hover:text-text" href={`mailto:${r.contact}`}>{r.contact}</a>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/40 px-4 py-3 pl-5 sm:px-5 sm:pl-6">
                  {r.status === "OPEN" ? (
                    <>
                      <ActionButton label="Mark resolved" tone="good" icon={<CheckCircle2 className="h-3.5 w-3.5" />} action={setReportStatus.bind(null, r.id, "RESOLVED")} />
                      <ActionButton label="Dismiss" icon={<XCircle className="h-3.5 w-3.5" />} action={setReportStatus.bind(null, r.id, "DISMISSED")} />
                    </>
                  ) : (
                    <ActionButton label="Reopen" icon={<RotateCcw className="h-3.5 w-3.5" />} action={setReportStatus.bind(null, r.id, "OPEN")} />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty icon={<Flag className="h-5 w-5" />} title={d.status === "open" ? "No open reports" : "Nothing closed yet"} hint={d.status === "open" ? "Reports from the public form show up here." : undefined} />
      )}
    </div>
  );
}
