import { prisma, db } from "@/lib/db";
import { cdn } from "@/lib/cdn";
import { ActionButton } from "@/components/console/ActionForm";
import { resolveDuplicate, dismissDuplicate } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

type W = Awaited<ReturnType<typeof loadWork>>;
const loadWork = (id: string) =>
  prisma.work.findUnique({
    where: { id },
    include: { sources: { select: { site: true } }, tags: { where: { type: "ARTIST" }, select: { name: true }, take: 3 } },
  });

function Side({ w, label }: { w: NonNullable<W>; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 gap-3">
      {cdn(w.coverKey) ? <img src={cdn(w.coverKey)!} alt="" className="h-36 w-24 shrink-0 rounded object-cover" loading="lazy" /> : <div className="h-36 w-24 shrink-0 rounded bg-surface-2" />}
      <div className="min-w-0 space-y-1 text-xs">
        <div className="text-white/40">{label}</div>
        <div className="text-sm font-semibold">#{w.publicId} <span className="font-normal text-white/60">[{w.language}]</span> {w.title}</div>
        <div className="text-white/60">{w.kind.toLowerCase()} - {w.pageCount} pages - <span className={w.publish === "PUBLISHED" ? "text-emerald-400" : w.publish === "REJECTED" ? "text-red-400" : "text-amber-400"}>{w.publish.toLowerCase()}</span></div>
        <div className="text-white/50">from {[...new Set(w.sources.map((s) => s.site))].join(", ") || "-"}</div>
        {w.tags.length > 0 && <div className="text-white/50">{w.tags.map((t) => t.name).join(", ")}</div>}
      </div>
    </div>
  );
}

export default async function DuplicatesPage() {
  const cands = await db(() => prisma.duplicateCandidate.findMany({ where: { status: "OPEN" }, orderBy: { score: "desc" }, take: 30 }));
  const [open, merged] = await db(() =>
    Promise.all([prisma.duplicateCandidate.count({ where: { status: "OPEN" } }), prisma.duplicateCandidate.count({ where: { status: "MERGED" } })]),
  );
  const pairs = await Promise.all(cands.map(async (c) => ({ c, a: await loadWork(c.workId), b: await loadWork(c.otherId) })));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Duplicates <span className="text-sm font-normal text-white/40">({open} open, {merged} merged)</span></h1>
      <p className="text-xs text-white/50">
        The same release from two sources. Clear matches (same title, language, artist and size, from different sources) are merged automatically every day; these are the near-matches
        that were not clear enough. Merging keeps one work, moves the other&apos;s sources and tags onto it, and deletes the other&apos;s stored images. If either copy was rejected, the rejection wins.
      </p>
      {pairs.map(({ c, a, b }) =>
        a && b ? (
          <div key={c.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap gap-6">
              <Side w={a} label="Newer" />
              <Side w={b} label="Existing" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton label={`Keep #${a.publicId}`} tone="good" confirm={`Merge #${b.publicId} into #${a.publicId}?`} action={resolveDuplicate.bind(null, c.id, a.publicId)} />
              <ActionButton label={`Keep #${b.publicId}`} tone="good" confirm={`Merge #${a.publicId} into #${b.publicId}?`} action={resolveDuplicate.bind(null, c.id, b.publicId)} />
              <ActionButton label="Different works" action={dismissDuplicate.bind(null, c.id)} />
              <span className="text-xs text-white/40">match {(c.score * 100).toFixed(0)}% - {c.reasons.join(", ")}</span>
            </div>
          </div>
        ) : null,
      )}
      {!pairs.length && <p className="text-sm text-white/50">No open duplicates.</p>}
    </div>
  );
}
