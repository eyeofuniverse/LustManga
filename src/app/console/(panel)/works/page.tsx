import Link from "next/link";
import type { Prisma, PublishStatus } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { cdn } from "@/lib/cdn";
import { ActionButton } from "@/components/console/ActionForm";
import { setWorkPublish, deleteWork, rejectWork } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";
const PAGE = 30;
type SP = { q?: string; publish?: string; lang?: string; page?: string };
const STATES: PublishStatus[] = ["PUBLISHED", "DRAFT", "REJECTED"];

export default async function WorksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();
  const publish = STATES.includes(sp.publish as PublishStatus) ? (sp.publish as PublishStatus) : undefined;
  const where: Prisma.WorkWhereInput = {
    ...(publish ? { publish } : {}),
    ...(sp.lang ? { language: sp.lang } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, ...(Number(q) ? [{ publicId: Number(q) }] : [])] } : {}),
  };
  const [works, total, langs] = await db(() =>
    Promise.all([
      prisma.work.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
      prisma.work.count({ where }),
      prisma.work.groupBy({ by: ["language"], _count: true, orderBy: { _count: { language: "desc" } } }),
    ]),
  );
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: String(n) })) if (v) p.set(k, v);
    return `/console/works?${p}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Works <span className="text-sm font-normal text-white/40">({total.toLocaleString()})</span></h1>
      <form action="/console/works" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="title or #id" className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm" />
        <select name="publish" defaultValue={publish ?? ""} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
          <option value="">Any state</option>
          {STATES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </select>
        <select name="lang" defaultValue={sp.lang ?? ""} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
          <option value="">Any language</option>
          {langs.map((l) => <option key={l.language} value={l.language}>{l.language} ({l._count})</option>)}
        </select>
        <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white">Filter</button>
      </form>

      <div className="overflow-hidden rounded-xl border border-line">
        {works.map((w) => (
          <div key={w.id} className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2 last:border-0">
            {cdn(w.coverKey) ? <img src={cdn(w.coverKey)!} alt="" className="h-14 w-10 rounded object-cover" loading="lazy" /> : <div className="h-14 w-10 rounded bg-surface-2" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">#{w.publicId} {w.title}</div>
              <div className="text-xs text-white/50">
                {w.language} - {w.kind.toLowerCase()} - {w.pageCount} pages -{" "}
                <span className={w.publish === "PUBLISHED" ? "text-emerald-400" : w.publish === "REJECTED" ? "text-red-400" : "text-amber-400"}>{w.publish.toLowerCase()}</span>
                {w.needsReview && " - needs review"}
                {w.deferFetch && " - not downloaded"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {w.publish !== "PUBLISHED" ? (
                <ActionButton label="Publish" tone="good" action={setWorkPublish.bind(null, w.publicId, "PUBLISHED")} />
              ) : (
                <ActionButton label="Unpublish" action={setWorkPublish.bind(null, w.publicId, "DRAFT")} />
              )}
              {w.publish !== "REJECTED" && <ActionButton label="Reject" tone="bad" confirm="Reject and delete stored images?" action={rejectWork.bind(null, w.publicId)} />}
              <ActionButton label="Delete" tone="bad" confirm="Remove this work and delete all its stored images?" action={deleteWork.bind(null, w.publicId)} />
            </div>
          </div>
        ))}
        {!works.length && <p className="bg-surface p-4 text-sm text-white/50">No works match.</p>}
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && <Link className="underline" href={qs(page - 1)}>Previous</Link>}
          <span className="text-white/50">Page {page} of {pages}</span>
          {page < pages && <Link className="underline" href={qs(page + 1)}>Next</Link>}
        </div>
      )}
    </div>
  );
}
