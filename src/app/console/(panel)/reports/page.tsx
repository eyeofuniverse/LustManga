import Link from "next/link";
import { prisma, db } from "@/lib/db";
import { ActionButton } from "@/components/console/ActionForm";
import { setReportStatus } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { DMCA: "Copyright / takedown", BROKEN: "Broken pages", OTHER: "Other" };
const TONE: Record<string, string> = { DMCA: "bg-red-500/15 text-red-300", BROKEN: "bg-amber-500/15 text-amber-300", OTHER: "bg-sky-500/15 text-sky-300" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status === "closed" ? "closed" : "open";
  const [rows, open, closed] = await db(() =>
    Promise.all([
      prisma.report.findMany({
        where: status === "open" ? { status: "OPEN" } : { status: { not: "OPEN" } },
        // takedown requests first: they are time-sensitive
        orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.report.count({ where: { status: { not: "OPEN" } } }),
    ]),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Reports</h1>
      <div className="flex gap-2">
        <Link href="/console/reports" className={`rounded-md px-3 py-1.5 text-sm ${status === "open" ? "bg-accent text-white" : "bg-surface text-white/70 hover:bg-surface-2"}`}>Open <b>{open}</b></Link>
        <Link href="/console/reports?status=closed" className={`rounded-md px-3 py-1.5 text-sm ${status === "closed" ? "bg-accent text-white" : "bg-surface text-white/70 hover:bg-surface-2"}`}>Closed <b>{closed}</b></Link>
      </div>
      <p className="text-xs text-white/50">Submitted from the public report form. Copyright requests are listed first.</p>

      {rows.map((r) => (
        <div key={r.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded px-2 py-0.5 font-semibold ${TONE[r.kind] ?? TONE.OTHER}`}>{KIND[r.kind] ?? r.kind}</span>
            <span className="text-white/40">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
            {r.workId && (
              <>
                <Link href={`/console/works?q=${r.workId}`} className="underline text-white/70">work #{r.workId}</Link>
                <a href={`/g/${r.workId}`} target="_blank" rel="noreferrer noopener" className="underline text-white/70">view public page</a>
              </>
            )}
            {r.status !== "OPEN" && <span className="text-white/50">{r.status.toLowerCase()}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm">{r.details}</p>
          {r.contact && <p className="text-xs text-white/60">Contact: <a className="underline" href={`mailto:${r.contact}`}>{r.contact}</a></p>}
          <div className="flex flex-wrap gap-2">
            {r.status === "OPEN" ? (
              <>
                <ActionButton label="Mark resolved" tone="good" action={setReportStatus.bind(null, r.id, "RESOLVED")} />
                <ActionButton label="Dismiss" action={setReportStatus.bind(null, r.id, "DISMISSED")} />
              </>
            ) : (
              <ActionButton label="Reopen" action={setReportStatus.bind(null, r.id, "OPEN")} />
            )}
          </div>
        </div>
      ))}
      {!rows.length && <p className="text-sm text-white/50">{status === "open" ? "No open reports." : "Nothing closed yet."}</p>}
    </div>
  );
}
