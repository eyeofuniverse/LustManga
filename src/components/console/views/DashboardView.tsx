import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, Copy, FileText, Flag, HardDrive, Images, Lock, ShieldAlert } from "lucide-react";
import type { DashboardData, RunRow } from "@/lib/admin/dashboard";
import { ago, duration, fmtBytes } from "@/lib/admin/format";
import { compact } from "@/lib/format";
import { Badge, BarList, Card, DayBars, PageHeader, SectionTitle, Split, Stat, type Tone } from "../ui";

function Attention({ href, icon, label, count, calm, tone }: { href: string; icon: React.ReactNode; label: string; count: number; calm: string; tone: Tone }) {
  const hot = count > 0;
  return (
    <Link
      href={href}
      className={`c-card group flex items-center gap-3 p-3 transition sm:gap-3.5 sm:p-4 hover:border-accent/40 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${hot ? "" : "opacity-80"}`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11 ${hot ? { good: "bg-good/10 text-good", warn: "bg-warn/10 text-warn", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", accent: "bg-accent/10 text-accent", muted: "bg-surface-2 text-muted" }[tone] : "bg-surface-2 text-muted"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-muted">{label}</span>
        <span className="mt-0.5 flex items-baseline gap-2">
          <span className="font-display text-2xl font-extrabold leading-none tabular-nums">{count.toLocaleString()}</span>
          <span className="hidden truncate text-xs text-muted sm:inline">{hot ? "waiting" : calm}</span>
        </span>
      </span>
      <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted transition sm:block group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
    </Link>
  );
}

function RunItem({ r }: { r: RunRow }) {
  const running = !r.finishedAt;
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${running ? "bg-warn/10 text-warn" : r.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}
        aria-hidden="true"
      >
        {running ? <span className="h-2 w-2 animate-pulse rounded-full bg-warn" /> : r.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{r.site}<span className="font-normal text-muted"> · {r.mode}</span></span>
        <span className="block truncate text-xs text-muted">
          {ago(r.startedAt)} · {duration(r.startedAt, r.finishedAt)}
        </span>
      </span>
      <span className="hidden text-right text-xs tabular-nums text-muted sm:block">
        <span className="block"><b className="font-semibold text-text">{r.worksCreated}</b> new works</span>
        <span className="block">{r.pagesStored.toLocaleString()} pages</span>
      </span>
      <Badge tone={running ? "warn" : r.ok ? "good" : "bad"} dot>
        {running ? "running" : r.ok ? "ok" : `${r.errorCount} error${r.errorCount === 1 ? "" : "s"}`}
      </Badge>
    </li>
  );
}

export function DashboardView({ d }: { d: DashboardData }) {
  const { works, chapters, attention } = d;
  const needs = attention.review + attention.reports + attention.duplicates + attention.failedChapters;
  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Dashboard"
        description={needs ? `${needs.toLocaleString()} item${needs === 1 ? "" : "s"} need${needs === 1 ? "s" : ""} a look. Everything else is running on its own.` : "Everything is clear. The importers keep running on their own."}
        actions={
          attention.review > 0 ? (
            <Link href="/console/review" className="c-btn-primary">
              Open the review queue <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />

      <section aria-label="Needs attention" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Attention href="/console/review" icon={<ShieldAlert className="h-5 w-5" />} label="Review queue" count={attention.review} calm="all reviewed" tone="warn" />
        <Attention href="/console/reports" icon={<Flag className="h-5 w-5" />} label="Open reports" count={attention.reports} calm="no reports" tone="bad" />
        <Attention href="/console/duplicates" icon={<Copy className="h-5 w-5" />} label="Possible duplicates" count={attention.duplicates} calm="none open" tone="info" />
        <Attention href="/console/runs" icon={<AlertTriangle className="h-5 w-5" />} label="Failed chapters" count={attention.failedChapters} calm="all fetched" tone="bad" />
      </section>

      <section aria-label="Catalogue" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Published" value={works.published} icon={<BookOpen className="h-4 w-4" />} tone="good" sub={`${works.series.toLocaleString()} series`} href="/console/works?publish=PUBLISHED" />
        <Stat label="Drafts" value={works.draft} icon={<FileText className="h-4 w-4" />} tone="warn" sub={`${works.rejected.toLocaleString()} rejected`} href="/console/works?publish=DRAFT" />
        <Stat label="Chapters" value={chapters.ready} icon={<Images className="h-4 w-4" />} tone="info" sub={`${chapters.queued.toLocaleString()} queued · ${chapters.failed.toLocaleString()} failed`} />
        <Stat label="Pages stored" value={compact(d.pages)} icon={<HardDrive className="h-4 w-4" />} tone="accent" sub={fmtBytes(d.bytes)} />
        <Stat label="Quarantined" value={d.quarantined} icon={<Lock className="h-4 w-4" />} tone="muted" sub="metadata only, never downloaded" href="/console/review?tab=quarantined" className="col-span-2 lg:col-span-1" />
      </section>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <SectionTitle hint="Where every item the importers looked at ended up">Catalogue</SectionTitle>
          <Split
            parts={[
              { label: "Published", value: works.published, tone: "good" },
              { label: "Draft", value: works.draft, tone: "warn" },
              { label: "Rejected", value: works.rejected, tone: "bad" },
              { label: "Quarantined", value: d.quarantined, tone: "muted" },
            ]}
          />
          <div className="mt-6 border-t border-line pt-5">
            <SectionTitle hint="Works added per day, last 14 days">Growth</SectionTitle>
            <DayBars data={d.growth} label="Works added" />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <SectionTitle hint="Published works" action={<Link href="/console/works" className="c-link">All works</Link>}>
            Languages
          </SectionTitle>
          <BarList rows={d.languages} />
          <div className="mt-6 border-t border-line pt-5">
            <SectionTitle hint="Where published works came from">Sources</SectionTitle>
            <BarList rows={d.sources} tone="info" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <SectionTitle action={<Link href="/console/runs" className="c-link">All runs</Link>}>Recent ingest runs</SectionTitle>
          {d.runs.length ? <ul className="divide-y divide-line">{d.runs.map((r) => <RunItem key={r.id} r={r} />)}</ul> : <p className="py-6 text-center text-sm text-muted">No runs yet</p>}
        </Card>
        <Card className="xl:col-span-2">
          <SectionTitle hint="Most used" action={<Link href="/console/tags" className="c-link">Manage</Link>}>Top tags</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {d.topTags.map((t) => (
              <li key={t.type + t.name} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs">
                <span className="font-medium">{t.name}</span>
                <span className="tabular-nums text-muted">{compact(t.count)}</span>
              </li>
            ))}
            {!d.topTags.length && <li className="text-xs text-muted">No tags yet</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
