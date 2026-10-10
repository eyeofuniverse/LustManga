import Link from "next/link";
import { Ban, CheckCircle2, ChevronDown, Lock, Plus, ShieldAlert, Sparkles, Star, Tag, Trash2 } from "lucide-react";
import { removeTerm } from "@/lib/admin/actions";
import { addTermAction, createTagAction, deleteAction, flagAction, mergeAction, renameAction } from "@/lib/admin/form-actions";
import type { TagRow, TagsData, TermRow } from "@/lib/admin/types";
import { compact } from "@/lib/format";
import { ActionForm, ChipRemove } from "../ActionForm";
import { Badge, Card, Empty, Note, PageHeader, Pager, SearchField, SectionTitle, SelectField, Tabs, type Tone } from "../ui";

const TYPES = ["tag", "artist", "group", "parody", "character", "language", "category"];

const TIERS: { tier: string; title: string; blurb: string; tone: Tone; icon: React.ReactNode }[] = [
  {
    tier: "QUARANTINE",
    title: "Hard terms: quarantined",
    blurb: "A work carrying one of these (in its tags or title) is recorded as metadata only: no images are downloaded and it is never published. The core terms are enforced from code and cannot be removed here. You can add more terms to make the gate stricter.",
    tone: "bad",
    icon: <Ban className="h-4 w-4" />,
  },
  {
    tier: "DEFER",
    title: "Explicit age markers: review before download",
    blurb: "Held as a draft for an admin and not downloaded until approved. A rejected work never has its images stored. Matched in tags and titles.",
    tone: "warn",
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  {
    tier: "REVIEW",
    title: "Ambiguous markers: held for review",
    blurb: "Held as a draft for an admin; images are downloaded so you can look. Matched in tags, titles and descriptions.",
    tone: "info",
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    tier: "ALLOWED",
    title: "Allowed phrases",
    blurb: "Normal adult phrases that contain a flagged word (for example “college student”). A match inside these is ignored.",
    tone: "good",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
];
const EDGE: Record<Tone, string> = { good: "--good", warn: "--warn", bad: "--bad", info: "--info", accent: "--accent", muted: "--muted" };
const ICON_BG: Record<Tone, string> = { good: "bg-good/10 text-good", warn: "bg-warn/10 text-warn", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", accent: "bg-accent/10 text-accent", muted: "bg-surface-2 text-muted" };

function Chip({ t }: { t: TermRow }) {
  return (
    <li className="inline-flex min-h-[30px] items-center gap-1.5 rounded-lg bg-surface-2 py-0.5 pl-2.5 pr-1.5 text-xs">
      {t.locked && <Lock className="h-3 w-3 text-muted" aria-label="Locked: enforced from code" />}
      <span className="font-medium">{t.term}</span>
      {t.caught > 0 && <span className="rounded bg-surface-3/70 px-1 text-[10px] font-bold tabular-nums text-muted" title="Items this term has caught">{t.caught.toLocaleString()}</span>}
      {!t.locked ? <ChipRemove label={t.term} action={removeTerm.bind(null, t.id)} /> : <span className="w-1" />}
    </li>
  );
}

function Terms({ terms }: { terms: TermRow[] }) {
  return (
    <>
      <Note tone="info" icon={<ShieldAlert className="h-4 w-4" />}>
        These lists decide what the importers hold for you. Everything except quarantine is decided by an admin in the Review queue, never automatically. Changes apply to the next ingest run.
      </Note>
      <div className="grid gap-4 xl:grid-cols-2">
        {TIERS.map(({ tier, title, blurb, tone, icon }) => {
          const list = terms.filter((t) => t.tier === tier);
          return (
            <section key={tier} aria-label={title} className="c-card c-edge flex flex-col p-4 pl-5 sm:p-5 sm:pl-6" style={{ ["--edge" as string]: `rgb(var(${EDGE[tone]}))` }}>
              <div className="flex items-start gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ICON_BG[tone]}`}>{icon}</span>
                <div className="min-w-0">
                  <h3 className="font-display text-[15px] font-bold leading-snug">
                    {title} <span className="font-normal text-muted">({list.length})</span>
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{blurb}</p>
                </div>
              </div>
              <ul className="my-4 flex flex-1 flex-wrap content-start gap-1.5">
                {list.map((t) => <Chip key={t.id} t={t} />)}
                {!list.length && <li className="text-xs text-muted">Empty</li>}
              </ul>
              <ActionForm action={addTermAction} className="flex gap-2">
                <input type="hidden" name="tier" value={tier} />
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Add a term to {title}</span>
                  <input name="term" placeholder={tier === "QUARANTINE" ? "Add a stricter term" : "Add a term or phrase"} className="c-input" />
                </label>
                <button className="c-btn-default"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add</button>
              </ActionForm>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Manage({ t }: { t: TagRow }) {
  return (
    <details className="group border-t border-line bg-bg/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-xs font-semibold text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true" /> Manage “{t.name}”
      </summary>
      <div className="grid gap-4 px-4 pb-4 pt-1 md:grid-cols-2">
        <ActionForm action={renameAction} className="space-y-1">
          <input type="hidden" name="id" value={t.id} />
          <label className="c-label" htmlFor={`rn-${t.id}`}>Rename</label>
          <div className="flex gap-2">
            <input id={`rn-${t.id}`} name="name" defaultValue={t.name} className="c-input" />
            <button className="c-btn-default">Rename</button>
          </div>
        </ActionForm>
        <ActionForm action={mergeAction} className="space-y-1" confirm={{ title: "Merge this tag?", message: "All its works move to the target tag and this tag is removed. Its old address redirects.", confirmLabel: "Merge" }} danger>
          <input type="hidden" name="id" value={t.id} />
          <label className="c-label" htmlFor={`mg-${t.id}`}>Merge into</label>
          <div className="flex gap-2">
            <input id={`mg-${t.id}`} name="into" placeholder="an existing tag name" className="c-input" />
            <button className="c-btn-default">Merge</button>
          </div>
        </ActionForm>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <ActionForm action={flagAction}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="flag" value="hidden" />
            <input type="hidden" name="value" value={String(!t.hidden)} />
            <button className="c-btn-default">{t.hidden ? "Unhide" : "Hide from public"}</button>
          </ActionForm>
          <ActionForm action={flagAction}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="flag" value="featured" />
            <input type="hidden" name="value" value={String(!t.featured)} />
            <button className="c-btn-default"><Star className="h-3.5 w-3.5" aria-hidden="true" /> {t.featured ? "Unfeature" : "Feature"}</button>
          </ActionForm>
          <ActionForm action={deleteAction} className="ml-auto" confirm={{ title: `Delete “${t.name}”?`, message: "It is removed from every work. This cannot be undone.", confirmLabel: "Delete" }} danger>
            <input type="hidden" name="id" value={t.id} />
            <button className="c-btn-bad"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</button>
          </ActionForm>
        </div>
      </div>
    </details>
  );
}

function TagList({ d }: { d: TagsData }) {
  const filtered = !!(d.q || d.type || d.flag || d.sort !== "count");
  const href = (n: number) => {
    const p = new URLSearchParams({ view: "tags" });
    if (d.q) p.set("q", d.q);
    if (d.type) p.set("type", d.type.toUpperCase());
    if (d.sort && d.sort !== "count") p.set("sort", d.sort);
    if (d.flag) p.set("flag", d.flag);
    if (n > 1) p.set("page", String(n));
    return `/console/tags?${p}`;
  };
  return (
    <>
      <form action="/console/tags" className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_9rem_auto]">
        <input type="hidden" name="view" value="tags" />
        <SearchField name="q" defaultValue={d.q} placeholder="Search tags" className="sm:col-span-2 lg:col-span-1" />
        <SelectField name="type" label="Type" defaultValue={d.type.toUpperCase()}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t.toUpperCase()}>{t}</option>)}
        </SelectField>
        <SelectField name="sort" label="Sort" defaultValue={d.sort}>
          <option value="count">Most used</option>
          <option value="name">Name</option>
          <option value="new">Newest</option>
        </SelectField>
        <SelectField name="flag" label="Flag" defaultValue={d.flag}>
          <option value="">Any</option>
          <option value="hidden">Hidden</option>
          <option value="featured">Featured</option>
        </SelectField>
        <div className="flex gap-2">
          <button className="c-btn-primary flex-1 lg:flex-none">Filter</button>
          {filtered && <Link href="/console/tags?view=tags" className="c-btn-default">Clear</Link>}
        </div>
      </form>

      <details className="c-card mb-5 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
          <Plus className="h-4 w-4 text-accent" aria-hidden="true" /> Create a tag
        </summary>
        <ActionForm action={createTagAction} className="flex flex-wrap items-end gap-2 border-t border-line p-4">
          <label className="w-36">
            <span className="c-label">Type</span>
            <select name="type" className="c-input">{TYPES.map((t) => <option key={t} value={t.toUpperCase()}>{t}</option>)}</select>
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className="c-label">Name</span>
            <input name="name" placeholder="New tag name" className="c-input" />
          </label>
          <button className="c-btn-primary">Create tag</button>
        </ActionForm>
      </details>

      {d.tags.length ? (
        <Card pad={false}>
          <ul className="c-divide">
            {d.tags.map((t) => (
              <li key={t.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-1 basis-48 truncate text-[14px] font-medium" title={t.name}>{t.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {t.hidden && <Badge tone="muted">hidden</Badge>}
                    {t.featured && <Badge tone="accent">featured</Badge>}
                    {t.aliases > 0 && <Badge tone="info">{t.aliases} alias{t.aliases === 1 ? "" : "es"}</Badge>}
                    <Badge tone="muted">{t.type.toLowerCase()}</Badge>
                  </span>
                  <span className="w-16 text-right text-xs tabular-nums text-muted" title={`${t.count.toLocaleString()} works`}>{compact(t.count)}</span>
                </div>
                <Manage t={t} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Empty icon={<Tag className="h-5 w-5" />} title="No tags match" hint="Try another search, or clear the filters." />
      )}
      <Pager page={d.page} pages={d.pages} href={href} total={d.total} pageSize={d.pageSize} />
    </>
  );
}

export function TagsView({ d }: { d: TagsData }) {
  return (
    <div>
      <PageHeader title="Tags & safety" description="The safety term lists that decide what is held for review, and every tag, artist, circle, parody and character in the catalogue." />
      <Tabs
        items={[
          { href: "/console/tags", label: "Safety terms", count: d.terms.length, active: d.view === "terms" },
          { href: "/console/tags?view=tags", label: "All tags", count: d.total, active: d.view === "tags" },
        ]}
      />
      {d.view === "terms" ? <Terms terms={d.terms} /> : <TagList d={d} />}
    </div>
  );
}
