import Link from "next/link";
import { Check, ExternalLink, EyeOff, Trash2, X } from "lucide-react";
import { deleteWork, rejectWork, setWorkPublish } from "@/lib/admin/actions";
import type { WorkRow, WorksData } from "@/lib/admin/types";
import { ago } from "@/lib/admin/format";
import { workHref } from "@/lib/format";
import { ActionButton } from "../ActionForm";
import { Badge, Card, Cover, Empty, PageHeader, Pager, PublishBadge, SearchField, SelectField } from "../ui";

function Row({ w }: { w: WorkRow }) {
  return (
    <li className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <Cover src={w.coverUrl} w={46} h={66} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-[14px] font-semibold leading-tight" title={w.title}>{w.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="muted">#{w.publicId}</Badge>
            <PublishBadge state={w.publish} />
            <Badge tone="info">{w.language}</Badge>
            <span className="text-xs text-muted">{w.kind.toLowerCase()} · {w.pageCount} pages · added {ago(w.createdAt)}</span>
            {w.needsReview && <Badge tone="warn">needs review</Badge>}
            {w.deferFetch && <Badge tone="bad">not downloaded</Badge>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:items-center sm:justify-end [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {w.publish === "PUBLISHED" && (
          <a className="c-btn-ghost" href={workHref(w)} target="_blank" rel="noopener" aria-label={`Open the public page of #${w.publicId}`}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> View
          </a>
        )}
        {w.publish !== "PUBLISHED" ? (
          <ActionButton label="Publish" tone="good" icon={<Check className="h-3.5 w-3.5" />} action={setWorkPublish.bind(null, w.publicId, "PUBLISHED")} />
        ) : (
          <ActionButton label="Unpublish" icon={<EyeOff className="h-3.5 w-3.5" />} action={setWorkPublish.bind(null, w.publicId, "DRAFT")} />
        )}
        {w.publish !== "REJECTED" && (
          <ActionButton label="Reject" tone="bad" icon={<X className="h-3.5 w-3.5" />} confirm={{ title: "Reject this work?", message: "Its stored images are deleted and it can no longer be published." }} action={rejectWork.bind(null, w.publicId)} />
        )}
        <ActionButton label="Delete" tone="bad" icon={<Trash2 className="h-3.5 w-3.5" />} confirm={{ title: "Delete this work?", message: "The work and all of its stored images are removed for good." }} action={deleteWork.bind(null, w.publicId)} />
      </div>
    </li>
  );
}

export function WorksView({ d }: { d: WorksData }) {
  const filtered = !!(d.q || d.publish || d.lang);
  const href = (n: number) => {
    const p = new URLSearchParams();
    if (d.q) p.set("q", d.q);
    if (d.publish) p.set("publish", d.publish);
    if (d.lang) p.set("lang", d.lang);
    if (n > 1) p.set("page", String(n));
    return `/console/works${p.size ? `?${p}` : ""}`;
  };
  return (
    <div>
      <PageHeader title="Works" count={d.total} description="Every work in the catalogue. Search by title or by number (#123), and publish, unpublish, reject or delete." />

      <form action="/console/works" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_11rem_auto]">
        <SearchField name="q" defaultValue={d.q} placeholder="Search by title or #id" className="col-span-2 sm:col-span-1" />
        <SelectField name="publish" label="State" defaultValue={d.publish}>
          <option value="">Any state</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="REJECTED">Rejected</option>
        </SelectField>
        <SelectField name="lang" label="Language" defaultValue={d.lang}>
          <option value="">Any language</option>
          {d.langs.map((l) => (
            <option key={l.language} value={l.language}>{l.language} ({l.count.toLocaleString()})</option>
          ))}
        </SelectField>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button className="c-btn-primary flex-1 sm:flex-none">Filter</button>
          {filtered && <Link href="/console/works" className="c-btn-default">Clear</Link>}
        </div>
      </form>

      {d.rows.length ? (
        <Card pad={false}>
          <ul className="c-divide">{d.rows.map((w) => <Row key={w.id} w={w} />)}</ul>
        </Card>
      ) : (
        <Empty title="No works match" hint={filtered ? "Try a different search, or clear the filters." : "Nothing has been imported yet."} action={filtered ? <Link href="/console/works" className="c-btn-default">Clear filters</Link> : undefined} />
      )}
      <Pager page={d.page} pages={d.pages} href={href} total={d.total} pageSize={d.pageSize} />
    </div>
  );
}
