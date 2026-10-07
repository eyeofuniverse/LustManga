import { prisma, db } from "@/lib/db";

export const dynamic = "force-dynamic";

const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);
const ago = (d: Date | null) => {
  if (!d) return "running";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 60 ? `${m}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-white/50">{sub}</div>}
    </div>
  );
}

export default async function Dashboard() {
  const [byPublish, chapters, pages, runs, langs, topTags, suppressed] = await db(() =>
    Promise.all([
      prisma.work.groupBy({ by: ["publish"], _count: true }),
      prisma.chapter.groupBy({ by: ["status"], _count: true }),
      prisma.chapter.aggregate({ where: { status: "READY" }, _sum: { pageCount: true, bytes: true } }),
      prisma.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: 6 }),
      prisma.work.groupBy({ by: ["language"], where: { publish: "PUBLISHED" }, _count: true, orderBy: { _count: { language: "desc" } }, take: 8 }),
      prisma.tag.findMany({ orderBy: { count: "desc" }, take: 8, select: { name: true, type: true, count: true } }),
      prisma.suppressedSource.count(),
    ]),
  );
  const n = (rows: { _count: number; publish?: string; status?: string }[], k: string) =>
    rows.find((r) => r.publish === k || r.status === k)?._count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Published works" value={n(byPublish, "PUBLISHED")} sub={`${n(byPublish, "DRAFT")} draft, ${n(byPublish, "REJECTED")} rejected`} />
        <Stat label="Chapters ready" value={n(chapters, "READY")} sub={`${n(chapters, "QUEUED")} queued, ${n(chapters, "FAILED")} failed`} />
        <Stat label="Pages stored" value={(pages._sum.pageCount ?? 0).toLocaleString()} sub={fmtBytes(Number(pages._sum.bytes ?? 0))} />
        <Stat label="Quarantined" value={suppressed} sub="metadata only, never downloaded" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Recent ingest runs</h2>
          <table className="w-full text-xs">
            <thead className="text-left text-white/50">
              <tr><th className="pb-1">Mode</th><th>Started</th><th>Works</th><th>Chapters</th><th>Pages</th><th>Status</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1">{r.site}/{r.mode}</td>
                  <td>{ago(r.startedAt)}</td>
                  <td>{r.worksCreated}</td>
                  <td>{r.chaptersFetched}</td>
                  <td>{r.pagesStored}</td>
                  <td className={!r.finishedAt ? "text-amber-400" : r.ok ? "text-emerald-400" : "text-red-400"}>
                    {!r.finishedAt ? "running" : r.ok ? "ok" : `${r.errors.length} error(s)`}
                  </td>
                </tr>
              ))}
              {!runs.length && <tr><td colSpan={6} className="py-3 text-white/50">No runs yet</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Published by language</h2>
          <div className="flex flex-wrap gap-2">
            {langs.map((l) => (
              <span key={l.language} className="rounded-md bg-surface-2 px-2 py-1 text-xs">{l.language} <b>{l._count}</b></span>
            ))}
            {!langs.length && <span className="text-xs text-white/50">Nothing published yet</span>}
          </div>
          <h2 className="mb-3 mt-5 text-sm font-semibold">Top tags</h2>
          <div className="flex flex-wrap gap-2">
            {topTags.map((t) => (
              <span key={t.type + t.name} className="rounded-md bg-surface-2 px-2 py-1 text-xs">{t.name} <b>{t.count}</b></span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
