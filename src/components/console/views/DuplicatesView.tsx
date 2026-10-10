import { Copy, GitMerge } from "lucide-react";
import { dismissDuplicate, resolveDuplicate } from "@/lib/admin/actions";
import type { DupPair, DupSide, DuplicatesData } from "@/lib/admin/types";
import { ActionButton } from "../ActionForm";
import { Badge, Cover, Empty, Note, PageHeader, PublishBadge } from "../ui";

function Side({ w, label }: { w: DupSide; label: string }) {
  return (
    <div className="flex min-w-0 gap-3.5 rounded-xl bg-surface-2/40 p-3.5">
      <Cover src={w.coverUrl} w={84} h={120} />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug" title={w.title}>{w.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="muted">#{w.publicId}</Badge>
          <Badge tone="info">{w.language}</Badge>
          <PublishBadge state={w.publish} />
        </div>
        <p className="text-xs text-muted">
          {w.kind.toLowerCase()} · {w.pageCount} pages · from {w.sources.join(", ") || "unknown"}
          {w.artists.length > 0 && <> · {w.artists.join(", ")}</>}
        </p>
      </div>
    </div>
  );
}

function Pair({ p }: { p: DupPair }) {
  const pct = Math.round(p.score * 100);
  return (
    <article className="c-card c-edge overflow-hidden" style={{ ["--edge" as string]: "rgb(var(--info))" }}>
      <div className="grid gap-3 p-4 pl-5 sm:p-5 sm:pl-6 md:grid-cols-2">
        <Side w={p.a} label="Newer" />
        <Side w={p.b} label="Existing" />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/40 px-4 py-3 pl-5 sm:px-5 sm:pl-6">
        <ActionButton label={`Keep #${p.a.publicId}`} tone="good" icon={<GitMerge className="h-3.5 w-3.5" />} confirm={{ title: "Merge these works?", message: `#${p.b.publicId} is merged into #${p.a.publicId}: its sources and tags move across and its stored images are deleted.`, confirmLabel: `Keep #${p.a.publicId}` }} action={resolveDuplicate.bind(null, p.id, p.a.publicId)} />
        <ActionButton label={`Keep #${p.b.publicId}`} tone="good" icon={<GitMerge className="h-3.5 w-3.5" />} confirm={{ title: "Merge these works?", message: `#${p.a.publicId} is merged into #${p.b.publicId}: its sources and tags move across and its stored images are deleted.`, confirmLabel: `Keep #${p.b.publicId}` }} action={resolveDuplicate.bind(null, p.id, p.b.publicId)} />
        <ActionButton label="Different works" action={dismissDuplicate.bind(null, p.id)} />
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${pct}% match`}>
            <span className="absolute inset-y-0 left-0 rounded-full bg-info" style={{ width: `${pct}%` }} />
          </span>
          <b className="font-semibold tabular-nums text-text">{pct}%</b> {p.reasons.join(", ")}
        </span>
      </div>
    </article>
  );
}

export function DuplicatesView({ d }: { d: DuplicatesData }) {
  return (
    <div>
      <PageHeader title="Duplicates" count={`${d.open} open · ${d.merged} merged`} description="The same release from two sources, where the match was not clear enough to merge on its own." />
      <Note tone="info" icon={<Copy className="h-4 w-4" />}>
        Clear matches (same title, language, artist and size, from different sources) are merged automatically every day. Merging keeps one work, moves the other&apos;s sources and tags onto it and deletes its stored images. If either copy was rejected, the rejection wins.
      </Note>
      {d.pairs.length ? <div className="space-y-4">{d.pairs.map((p) => <Pair key={p.id} p={p} />)}</div> : <Empty icon={<Copy className="h-5 w-5" />} title="No open duplicates" hint="New near-matches show up here as they are found." />}
    </div>
  );
}
