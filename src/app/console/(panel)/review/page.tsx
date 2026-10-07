import Link from "next/link";
import { prisma, db } from "@/lib/db";
import { cdn } from "@/lib/cdn";
import { pagesOf } from "@/lib/pages";
import { approveWork, rejectWork, confirmSuppressed } from "@/lib/admin/actions";
import { ActionButton } from "@/components/console/ActionForm";

export const dynamic = "force-dynamic";
const PAGE = 15;

type Tab = "held" | "deferred" | "quarantined";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === "deferred" || sp.tab === "quarantined" ? sp.tab : "held";
  const page = Math.max(1, Number(sp.page) || 1);

  const [heldN, deferredN, quarN] = await db(() =>
    Promise.all([
      prisma.work.count({ where: { needsReview: true, publish: "DRAFT", deferFetch: false } }),
      prisma.work.count({ where: { needsReview: true, publish: "DRAFT", deferFetch: true } }),
      prisma.suppressedSource.count(),
    ]),
  );
  const total = tab === "held" ? heldN : tab === "deferred" ? deferredN : quarN;

  const tabs: [Tab, string, number][] = [
    ["held", "Held (images stored)", heldN],
    ["deferred", "Review before download", deferredN],
    ["quarantined", "Quarantined (metadata only)", quarN],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Review queue</h1>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, label, n]) => (
          <Link
            key={k}
            href={`/console/review?tab=${k}`}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? "bg-accent text-white" : "bg-surface text-white/70 hover:bg-surface-2"}`}
          >
            {label} <b>{n}</b>
          </Link>
        ))}
      </div>

      {tab === "held" && <Held page={page} />}
      {tab === "deferred" && <Deferred page={page} />}
      {tab === "quarantined" && <Quarantined page={page} />}

      <Pager tab={tab} page={page} total={total} />
    </div>
  );
}

function Reasons({ reasons }: { reasons: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">{r}</span>
      ))}
    </div>
  );
}

async function Held({ page }: { page: number }) {
  const works = await db(() =>
    prisma.work.findMany({
      where: { needsReview: true, publish: "DRAFT", deferFetch: false },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { sources: { select: { url: true }, take: 1 }, tags: { select: { name: true, type: true }, take: 14 } },
    }),
  );
  const firstPages = await Promise.all(
    works.map(async (w) => {
      const ch = await prisma.chapter.findFirst({ where: { workId: w.id, status: "READY" }, orderBy: { number: "asc" }, select: { id: true, pageData: true } });
      return ch ? pagesOf(ch, w.mediaId).slice(0, 4) : [];
    }),
  );
  if (!works.length) return <p className="text-sm text-white/50">Nothing waiting. </p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">Approve = it was a false flag, publish it. Reject = confirmed, deletes the stored images.</p>
      {works.map((w, i) => (
        <div key={w.id} className="flex gap-4 rounded-xl border border-line bg-surface p-4">
          <div className="flex shrink-0 gap-1">
            {cdn(w.coverKey) && <img src={cdn(w.coverKey)!} alt="" className="h-40 w-28 rounded object-cover" />}
            <div className="grid grid-cols-2 gap-1">
              {firstPages[i].map((p) => (
                <img key={p.key} src={cdn(p.key)!} alt="" className="h-[78px] w-14 rounded object-cover" loading="lazy" />
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="text-sm font-semibold">#{w.publicId} <span className="font-normal text-white/60">[{w.language}]</span> {w.title}</div>
            <Reasons reasons={w.safetyReasons} />
            <div className="line-clamp-2 text-xs text-white/60">{w.description}</div>
            <div className="text-xs text-white/50">{w.tags.map((t) => t.name).join(", ")}</div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <ActionButton label="Approve (false flag)" tone="good" action={approveWork.bind(null, w.publicId)} />
              <ActionButton label="Reject" tone="bad" confirm="Reject and delete this work's stored images?" action={rejectWork.bind(null, w.publicId)} />
              {w.sources[0] && <a className="text-xs text-white/60 underline" href={w.sources[0].url} target="_blank" rel="noreferrer noopener">source</a>}
              <span className="text-xs text-white/40">{w.pageCount} pages</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

async function Deferred({ page }: { page: number }) {
  const works = await db(() =>
    prisma.work.findMany({
      where: { needsReview: true, publish: "DRAFT", deferFetch: true },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { sources: { select: { url: true }, take: 1 } },
    }),
  );
  if (!works.length) return <p className="text-sm text-white/50">Nothing waiting.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">
        These carry an explicit age marker, so no images have been downloaded. Judge from the source page. Approve = fetch and publish on the next ingest run. Reject = it is never downloaded.
      </p>
      {works.map((w) => (
        <div key={w.id} className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <div className="text-sm font-semibold">#{w.publicId} <span className="font-normal text-white/60">[{w.language}]</span> {w.title}</div>
          <Reasons reasons={w.safetyReasons} />
          <div className="line-clamp-3 text-xs text-white/60">{w.description}</div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <ActionButton label="Approve (false flag)" tone="good" action={approveWork.bind(null, w.publicId)} />
            <ActionButton label="Reject" tone="bad" action={rejectWork.bind(null, w.publicId)} />
            {w.sources[0] && <a className="text-xs text-white/60 underline" href={w.sources[0].url} target="_blank" rel="noreferrer noopener">open source</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

async function Quarantined({ page }: { page: number }) {
  const rows = await db(() =>
    prisma.suppressedSource.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
  );
  if (!rows.length) return <p className="text-sm text-white/50">Nothing quarantined.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">
        The source itself tags these as child / child-like sexual content. Only the id, title and tags are stored; no images are downloaded and there is no publish action for this tab. Check the source link, then confirm.
      </p>
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate text-sm font-semibold">{r.title}</div>
            <Reasons reasons={r.reasons} />
            <div className="text-xs text-white/40">{r.site}:{r.externalId}</div>
          </div>
          {r.site === "mangadex" && (
            <a className="text-xs text-white/60 underline" href={`https://mangadex.org/title/${r.externalId}`} target="_blank" rel="noreferrer noopener">source</a>
          )}
          {r.confirmedAt ? (
            <span className="text-xs text-emerald-400">confirmed</span>
          ) : (
            <ActionButton label="Confirm" action={confirmSuppressed.bind(null, r.id)} />
          )}
        </div>
      ))}
    </div>
  );
}

function Pager({ tab, page, total }: { tab: string; page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      {page > 1 && <Link className="underline" href={`/console/review?tab=${tab}&page=${page - 1}`}>Previous</Link>}
      <span className="text-white/50">Page {page} of {pages}</span>
      {page < pages && <Link className="underline" href={`/console/review?tab=${tab}&page=${page + 1}`}>Next</Link>}
    </div>
  );
}
