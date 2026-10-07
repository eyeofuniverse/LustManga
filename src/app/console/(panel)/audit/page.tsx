import { prisma, db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const rows = await db(() => prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Audit log</h1>
      <p className="text-xs text-white/50">Every change made in this console: who, what, and when. Last 200 entries.</p>
      <div className="overflow-hidden rounded-xl border border-line">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-line bg-surface px-3 py-2 text-xs last:border-0">
            <span className="w-36 shrink-0 text-white/40">{r.createdAt.toISOString().slice(0, 19).replace("T", " ")}</span>
            <span className="w-44 shrink-0 truncate text-white/70">{r.actorEmail ?? "system"}</span>
            <span className="font-semibold">{r.action}</span>
            <span className="text-white/60">{r.targetType} {r.targetId}</span>
            {r.diff ? <span className="truncate text-white/40">{JSON.stringify(r.diff)}</span> : null}
          </div>
        ))}
        {!rows.length && <p className="bg-surface p-4 text-sm text-white/50">Nothing yet.</p>}
      </div>
    </div>
  );
}
