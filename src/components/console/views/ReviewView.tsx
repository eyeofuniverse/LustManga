import { Check, ExternalLink, Info, Lock, ShieldAlert, X } from "lucide-react";
import { approveWork, confirmSuppressed, rejectWork } from "@/lib/admin/actions";
import type { QuarantineRow, ReviewData, ReviewWork } from "@/lib/admin/types";
import { ago } from "@/lib/admin/format";
import { ActionButton } from "../ActionForm";
import { Badge, Card, Cover, Empty, Note, PageHeader, Pager, ReasonBadges, Tabs } from "../ui";

function Previews({ w }: { w: ReviewWork }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto lg:w-[352px] lg:shrink-0 lg:overflow-visible" aria-label="Stored pages">
      <Cover src={w.coverUrl} w={104} h={148} />
      <div className="flex gap-2 lg:grid lg:grid-cols-3 lg:content-start">
        {w.previews.slice(0, 5).map((src, i) => (
          <a key={src} href={src} target="_blank" rel="noreferrer noopener" aria-label={`Open stored page ${i + 1} full size`} className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
            <Cover src={src} w={66} h={92} className="transition hover:ring-accent/60" />
          </a>
        ))}
      </div>
    </div>
  );
}

function WorkCard({ w, deferred }: { w: ReviewWork; deferred: boolean }) {
  return (
    <article className="c-card c-edge overflow-hidden" style={{ ["--edge" as string]: deferred ? "rgb(var(--bad))" : "rgb(var(--warn))" }}>
      <div className="flex flex-col gap-4 p-4 pl-5 sm:p-5 sm:pl-6 lg:flex-row">
        {!deferred && <Previews w={w} />}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="muted">#{w.publicId}</Badge>
            <Badge tone="info">{w.language}</Badge>
            {!deferred && <Badge tone="muted">{w.pageCount} pages</Badge>}
            <span className="text-xs text-muted">queued {ago(w.createdAt)}</span>
          </div>
          <h3 className="font-display text-[17px] font-bold leading-snug tracking-tight">{w.title}</h3>
          <ReasonBadges reasons={w.reasons} />
          {w.description && <p className="line-clamp-3 text-[13px] leading-relaxed text-muted">{w.description}</p>}
          {w.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
              {w.tags.map((t) => (
                <li key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{t}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/40 px-4 py-3 pl-5 sm:px-5 sm:pl-6">
        <ActionButton label={deferred ? "Approve and fetch" : "Approve"} tone="good" icon={<Check className="h-3.5 w-3.5" />} action={approveWork.bind(null, w.publicId)} />
        <ActionButton
          label="Reject"
          tone="bad"
          icon={<X className="h-3.5 w-3.5" />}
          confirm={{ title: "Reject this work?", message: deferred ? "It will never be downloaded." : "Its stored images are deleted and it can no longer be published." }}
          action={rejectWork.bind(null, w.publicId)}
        />
        {w.sourceUrl && (
          <a className="c-btn-ghost ml-auto" href={w.sourceUrl} target="_blank" rel="noreferrer noopener">
            Source page <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}

function QuarantineItem({ r }: { r: QuarantineRow }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate text-[14px] font-semibold" title={r.title}>{r.title}</p>
        <ReasonBadges reasons={r.reasons} tone="bad" />
        <p className="font-mono text-[11px] text-muted">{r.site}:{r.externalId} · seen {ago(r.createdAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {r.site === "mangadex" && (
          <a className="c-btn-ghost" href={`https://mangadex.org/title/${r.externalId}`} target="_blank" rel="noreferrer noopener">
            Source <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
        {r.confirmedAt ? <Badge tone="good" dot>confirmed</Badge> : <ActionButton label="Confirm" icon={<Check className="h-3.5 w-3.5" />} action={confirmSuppressed.bind(null, r.id)} />}
      </div>
    </li>
  );
}

export function ReviewView({ d }: { d: ReviewData }) {
  const href = (n: number) => `/console/review?tab=${d.tab}${n > 1 ? `&page=${n}` : ""}`;
  return (
    <div>
      <PageHeader title="Review queue" description="Decide what the safety check held back. Nothing here is public until an admin says so." />
      <Tabs
        items={[
          { href: "/console/review", label: "Held", count: d.counts.held, active: d.tab === "held" },
          { href: "/console/review?tab=deferred", label: "Review before download", count: d.counts.deferred, active: d.tab === "deferred" },
          { href: "/console/review?tab=quarantined", label: "Quarantined", count: d.counts.quarantined, active: d.tab === "quarantined" },
        ]}
      />

      {d.tab === "held" && (
        <>
          <Note tone="warn" icon={<Info className="h-4 w-4" />}>
            <b className="text-text">Approve</b> if it was a false flag and it should be published. <b className="text-text">Reject</b> if the flag was right: the stored images are deleted.
          </Note>
          {d.works.length ? <div className="space-y-4">{d.works.map((w) => <WorkCard key={w.id} w={w} deferred={false} />)}</div> : <Empty icon={<ShieldAlert className="h-5 w-5" />} title="Nothing is waiting" hint="Every held work has been decided." />}
        </>
      )}

      {d.tab === "deferred" && (
        <>
          <Note tone="bad" icon={<Info className="h-4 w-4" />}>
            These carry an explicit age marker, so <b className="text-text">no images have been downloaded</b>. Judge from the source page. Approve fetches and publishes on the next ingest run; reject means it is never downloaded.
          </Note>
          {d.works.length ? <div className="space-y-4">{d.works.map((w) => <WorkCard key={w.id} w={w} deferred />)}</div> : <Empty icon={<ShieldAlert className="h-5 w-5" />} title="Nothing is waiting" hint="No work is held before download." />}
        </>
      )}

      {d.tab === "quarantined" && (
        <>
          <Note tone="bad" icon={<Lock className="h-4 w-4" />}>
            The source itself tags these as child or child-like sexual content. <b className="text-text">Only the id, title and tags are stored</b>: no images are downloaded and there is no publish action. Check the source, then confirm.
          </Note>
          {d.quarantined.length ? (
            <Card pad={false}>
              <ul className="c-divide">{d.quarantined.map((r) => <QuarantineItem key={r.id} r={r} />)}</ul>
            </Card>
          ) : (
            <Empty icon={<Lock className="h-5 w-5" />} title="Nothing quarantined" />
          )}
        </>
      )}

      <Pager page={d.page} pages={d.pages} href={href} total={d.total} pageSize={d.pageSize} />
    </div>
  );
}
