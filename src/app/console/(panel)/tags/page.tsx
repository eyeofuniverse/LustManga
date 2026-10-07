import Link from "next/link";
import type { Prisma, SafetyTier, TagType } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { ActionForm, ChipRemove } from "@/components/console/ActionForm";
import {
  addTerm,
  removeTerm,
  createTag,
  renameTag,
  mergeTags,
  setTagFlag,
  deleteTag,
} from "@/lib/admin/actions";

export const dynamic = "force-dynamic";
const PAGE = 40;
const TYPES: TagType[] = ["TAG", "ARTIST", "GROUP", "PARODY", "CHARACTER", "LANGUAGE", "CATEGORY"];

type SP = { q?: string; type?: string; sort?: string; flag?: string; page?: string };

const TIERS: { tier: SafetyTier; title: string; blurb: string; tone: string }[] = [
  {
    tier: "QUARANTINE",
    title: "Hard terms - quarantined",
    blurb:
      "A work carrying one of these (in its tags or title) is recorded as metadata only: no images are downloaded and it is never published. The core terms are enforced from code and cannot be removed here. You can add more terms to make the gate stricter.",
    tone: "border-red-500/40",
  },
  {
    tier: "DEFER",
    title: "Explicit age markers - review before download",
    blurb:
      "Held as DRAFT for an admin and NOT downloaded until approved. A rejected work never has its images stored. Matched in tags and titles.",
    tone: "border-orange-500/40",
  },
  {
    tier: "REVIEW",
    title: "Ambiguous markers - held for review",
    blurb: "Held as DRAFT for an admin; images are downloaded so you can look. Matched in tags, titles and descriptions.",
    tone: "border-amber-500/40",
  },
  {
    tier: "ALLOWED",
    title: "Allowed phrases",
    blurb: "Normal adult phrases that contain a flagged word (for example 'college student'). A match inside these is ignored.",
    tone: "border-emerald-500/40",
  },
];

export default async function TagsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const type = TYPES.includes(sp.type as TagType) ? (sp.type as TagType) : undefined;
  const q = (sp.q ?? "").trim();

  const where: Prisma.TagWhereInput = {
    ...(type ? { type } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(sp.flag === "hidden" ? { hidden: true } : sp.flag === "featured" ? { featured: true } : {}),
  };
  const orderBy: Prisma.TagOrderByWithRelationInput =
    sp.sort === "name" ? { name: "asc" } : sp.sort === "new" ? { id: "desc" } : { count: "desc" };

  const [tags, total, terms, workReasons, suppressedReasons] = await db(() =>
    Promise.all([
      prisma.tag.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, include: { _count: { select: { aliases: true } } } }),
      prisma.tag.count({ where }),
      prisma.safetyTerm.findMany({ orderBy: [{ tier: "asc" }, { term: "asc" }] }),
      prisma.$queryRaw<{ r: string; n: number }[]>`SELECT r, count(*)::int AS n FROM "Work", unnest("safetyReasons") AS r GROUP BY r`,
      prisma.$queryRaw<{ r: string; n: number }[]>`SELECT r, count(*)::int AS n FROM "SuppressedSource", unnest(reasons) AS r GROUP BY r`,
    ]),
  );

  // how many works each term has caught (reasons look like "tag:school uniform")
  const caught = new Map<string, number>();
  for (const { r, n } of [...workReasons, ...suppressedReasons]) {
    const term = r.slice(r.indexOf(":") + 1);
    caught.set(term, (caught.get(term) ?? 0) + n);
  }

  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/console/tags?${p}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Tags &amp; safety</h1>

      {/* ───────── safety terms ───────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Safety terms</h2>
        <p className="text-sm text-white/60">
          These lists decide what the ingest holds for you. Everything except quarantine is decided by an admin in the Review queue, never automatically. Changes apply to the next ingest run.
        </p>
        <div className="grid gap-4 xl:grid-cols-2">
          {TIERS.map(({ tier, title, blurb, tone }) => {
            const list = terms.filter((t) => t.tier === tier);
            return (
              <div key={tier} className={`rounded-xl border bg-surface p-4 ${tone}`}>
                <h3 className="text-sm font-semibold">{title} <span className="text-white/40">({list.length})</span></h3>
                <p className="mb-3 mt-1 text-xs text-white/55">{blurb}</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {list.map((t) => (
                    <span key={t.id} className="inline-flex items-center rounded-md bg-surface-2 px-2 py-1 text-xs">
                      {t.locked ? "\u{1F512} " : ""}
                      {t.term}
                      {caught.get(t.term) ? <b className="ml-1.5 text-white/50">{caught.get(t.term)}</b> : null}
                      {!t.locked && <ChipRemove label={t.term} action={removeTerm.bind(null, t.id)} />}
                    </span>
                  ))}
                  {!list.length && <span className="text-xs text-white/40">empty</span>}
                </div>
                <ActionForm action={addTermAction} className="flex gap-2">
                  <input type="hidden" name="tier" value={tier} />
                  <input
                    name="term"
                    placeholder={tier === "QUARANTINE" ? "add a stricter term" : "add a term or phrase"}
                    className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-xs"
                  />
                  <button className="rounded-md bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">Add</button>
                </ActionForm>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───────── tags ───────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">All tags <span className="text-sm font-normal text-white/40">({total.toLocaleString()})</span></h2>

        <form className="flex flex-wrap items-center gap-2" action="/console/tags">
          <input name="q" defaultValue={q} placeholder="search tags" className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm" />
          <select name="type" defaultValue={type ?? ""} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
          </select>
          <select name="sort" defaultValue={sp.sort ?? "count"} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
            <option value="count">Most used</option>
            <option value="name">Name</option>
            <option value="new">Newest</option>
          </select>
          <select name="flag" defaultValue={sp.flag ?? ""} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
            <option value="">Any</option>
            <option value="hidden">Hidden</option>
            <option value="featured">Featured</option>
          </select>
          <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white">Filter</button>
        </form>

        <ActionForm action={createTagAction} className="flex flex-wrap gap-2 rounded-xl border border-line bg-surface p-3">
          <select name="type" className="rounded-md border border-line bg-bg px-2 py-1.5 text-xs">
            {TYPES.map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
          </select>
          <input name="name" placeholder="new tag name" className="rounded-md border border-line bg-bg px-2 py-1.5 text-xs" />
          <button className="rounded-md bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">Create tag</button>
        </ActionForm>

        <div className="overflow-hidden rounded-xl border border-line">
          {tags.map((t) => (
            <div key={t.id} className="border-b border-line bg-surface last:border-0">
              <div className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {t.name}
                  {t.hidden && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">hidden</span>}
                  {t.featured && <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-[11px] text-accent">featured</span>}
                  {t._count.aliases > 0 && <span className="ml-2 text-[11px] text-white/40">{t._count.aliases} alias(es)</span>}
                </span>
                <span className="w-20 text-xs text-white/50">{t.type.toLowerCase()}</span>
                <span className="w-16 text-right text-xs text-white/50">{t.count.toLocaleString()}</span>
              </div>
              <details className="border-t border-line bg-bg/50 px-4 py-2">
                <summary className="cursor-pointer text-xs text-white/50">Manage</summary>
                <div className="mt-3 grid gap-3 pb-2 md:grid-cols-2">
                  <ActionForm action={renameAction} className="flex gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <input name="name" defaultValue={t.name} className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-xs" />
                    <button className="rounded-md bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">Rename</button>
                  </ActionForm>
                  <ActionForm action={mergeAction} className="flex gap-2" confirm="Merge this tag into the target? This moves all its works and removes this tag.">
                    <input type="hidden" name="id" value={t.id} />
                    <input name="into" placeholder="merge into (existing tag name)" className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-xs" />
                    <button className="rounded-md bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">Merge</button>
                  </ActionForm>
                  <div className="flex flex-wrap gap-2">
                    <ActionForm action={flagAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="flag" value="hidden" />
                      <input type="hidden" name="value" value={String(!t.hidden)} />
                      <button className="rounded-md bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">{t.hidden ? "Unhide" : "Hide from public"}</button>
                    </ActionForm>
                    <ActionForm action={flagAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="flag" value="featured" />
                      <input type="hidden" name="value" value={String(!t.featured)} />
                      <button className="rounded-md bg-surface-2 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">{t.featured ? "Unfeature" : "Feature"}</button>
                    </ActionForm>
                    <ActionForm action={deleteAction} confirm={`Delete "${t.name}"? It is removed from every work.`}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="rounded-md bg-red-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">Delete</button>
                    </ActionForm>
                  </div>
                </div>
              </details>
            </div>
          ))}
          {!tags.length && <p className="bg-surface p-4 text-sm text-white/50">No tags match.</p>}
        </div>

        {pages > 1 && (
          <div className="flex items-center gap-3 text-sm">
            {page > 1 && <Link className="underline" href={qs({ page: String(page - 1) })}>Previous</Link>}
            <span className="text-white/50">Page {page} of {pages}</span>
            {page < pages && <Link className="underline" href={qs({ page: String(page + 1) })}>Next</Link>}
          </div>
        )}
      </section>
    </div>
  );
}

async function addTermAction(fd: FormData) {
  "use server";
  return addTerm(String(fd.get("tier")) as SafetyTier, String(fd.get("term") ?? ""));
}
async function createTagAction(fd: FormData) {
  "use server";
  return createTag(String(fd.get("type")) as TagType, String(fd.get("name") ?? ""));
}
async function renameAction(fd: FormData) {
  "use server";
  return renameTag(Number(fd.get("id")), String(fd.get("name") ?? ""));
}
async function mergeAction(fd: FormData) {
  "use server";
  return mergeTags(Number(fd.get("id")), String(fd.get("into") ?? ""));
}
async function flagAction(fd: FormData) {
  "use server";
  return setTagFlag(Number(fd.get("id")), String(fd.get("flag")) as "hidden" | "featured", fd.get("value") === "true");
}
async function deleteAction(fd: FormData) {
  "use server";
  return deleteTag(Number(fd.get("id")));
}
