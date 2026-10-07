import { prisma, db } from "@/lib/db";
import { ActionButton } from "@/components/console/ActionForm";
import { retryFailedChapters } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const [runs, failed, failedCount] = await db(() =>
    Promise.all([
      prisma.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
      prisma.chapter.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { id: true, number: true, error: true, attempts: true, work: { select: { publicId: true, title: true, language: true } } },
      }),
      prisma.chapter.count({ where: { status: "FAILED" } }),
    ]),
  );

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Ingest runs</h1>

      <section className="space-y-2">
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-xs">
            <thead className="text-left text-white/50">
              <tr className="border-b border-line">
                <th className="p-2">Started</th><th>Run</th><th>Seen</th><th>Created</th><th>Held</th><th>Quarantined</th><th>Chapters</th><th>Pages</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="p-2 whitespace-nowrap">{r.startedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{r.site}/{r.mode}</td>
                  <td>{r.worksSeen}</td><td>{r.worksCreated}</td><td>{r.worksHeld}</td><td>{r.worksSuppressed}</td>
                  <td>{r.chaptersFetched}</td><td>{r.pagesStored}</td>
                  <td className={!r.finishedAt ? "text-amber-400" : r.ok ? "text-emerald-400" : "text-red-400"}>
                    {!r.finishedAt ? "running" : r.ok ? "ok" : `${r.errors.length} error(s)`}
                    {r.errors.length > 0 && <div className="mt-1 max-w-xs space-y-0.5 text-[11px] text-white/50">{r.errors.slice(0, 3).map((e, i) => <div key={i} className="truncate" title={e}>{e}</div>)}</div>}
                  </td>
                </tr>
              ))}
              {!runs.length && <tr><td colSpan={9} className="p-4 text-white/50">No runs yet</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Failed chapters <span className="text-sm font-normal text-white/40">({failedCount})</span></h2>
          {failedCount > 0 && <ActionButton label="Retry all" action={retryFailedChapters} />}
        </div>
        <p className="text-xs text-white/50">A chapter that fails 6 times stops being retried automatically. Retry all puts every failed chapter back in the queue for the next ingest run.</p>
        <div className="overflow-hidden rounded-xl border border-line">
          {failed.map((c) => (
            <div key={c.id} className="border-b border-line bg-surface px-3 py-2 text-xs last:border-0">
              <span className="font-semibold">#{c.work.publicId}</span> {c.work.title} <span className="text-white/50">[{c.work.language}] ch {c.number} - {c.attempts} attempt(s)</span>
              <div className="truncate text-red-300/80" title={c.error ?? ""}>{c.error}</div>
            </div>
          ))}
          {!failed.length && <p className="bg-surface p-4 text-sm text-white/50">No failed chapters.</p>}
        </div>
      </section>
    </div>
  );
}
