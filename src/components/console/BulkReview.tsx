"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2, X } from "lucide-react";
import { approveHeldBatch, approveWorks, type BulkResult } from "@/lib/admin/actions";
import { useConsole } from "./Toast";

/** Mass approval for the review queue: tick works, or take the whole Held tab, and approve them in one go. */

const BATCH = 200;
const FAILED = "That did not go through (your session may have expired). Reload and try again.";

interface Progress {
  scanned: number;
  total: number;
  approved: number;
}

interface Ctx {
  tab: "held" | "deferred";
  ids: number[];
  total: number;
  selected: Set<number>;
  allInTab: boolean;
  busy: boolean;
  progress: Progress | null;
  toggle: (id: number) => void;
  selectPage: (on: boolean) => void;
  selectAllInTab: () => void;
  clear: () => void;
  approveSelected: () => void;
  approveAll: () => void;
  stop: () => void;
}

const Context = createContext<Ctx | null>(null);
const useBulk = () => {
  const c = useContext(Context);
  if (!c) throw new Error("BulkReview parts must sit inside <BulkProvider>");
  return c;
};

export function BulkProvider({ tab, ids, total, children }: { tab: "held" | "deferred"; ids: number[]; total: number; children: React.ReactNode }) {
  const router = useRouter();
  const ui = useConsole();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allInTab, setAllInTab] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const stopped = useRef(false);

  // a new page of works (or one that shrank after an approval): forget selections that are no longer on screen
  const key = ids.join(",");
  useEffect(() => {
    setSelected((cur) => new Set([...cur].filter((id) => ids.includes(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggle = useCallback((id: number) => {
    setAllInTab(false); // choosing individually leaves "everything in the tab"
    setSelected((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const selectPage = useCallback((on: boolean) => {
    setAllInTab(false);
    setSelected(on ? new Set(ids) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const clear = useCallback(() => {
    setSelected(new Set());
    setAllInTab(false);
  }, []);

  const finish = (r: { approved: number; blocked: number; message: string }) => {
    ui.toast(r.message, r.approved || !r.blocked ? "good" : "bad");
    clear();
    router.refresh();
  };

  const approveSelected = useCallback(async () => {
    const list = [...selected];
    if (!list.length || busy) return;
    const ok = await ui.confirm({
      title: `Approve ${list.length.toLocaleString()} work${list.length === 1 ? "" : "s"}?`,
      message: "Each is approved exactly as if you clicked Approve on it: published now if its images are stored, otherwise after the next ingest run, and recorded in the audit log. Any that match a hard safety term are skipped.",
      confirmLabel: `Approve ${list.length.toLocaleString()}`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await approveWorks(list);
      r.ok ? finish(r) : ui.toast(r.message, "bad");
    } catch {
      ui.toast(FAILED, "bad");
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, busy]);

  const approveAll = useCallback(async () => {
    if (tab !== "held" || busy) return;
    const ok = await ui.confirm({
      title: `Approve all ${total.toLocaleString()} held works?`,
      message: "Every work in the Held tab is approved without being looked at one by one. Those with images stored are published immediately; the rest go live after the next ingest run. You can stop part-way, but what was approved stays approved. Works that match a hard safety term are skipped.",
      confirmLabel: `Approve all ${total.toLocaleString()}`,
      tone: "bad",
    });
    if (!ok) return;
    setBusy(true);
    stopped.current = false;
    let cursor: string | null = null;
    let scanned = 0;
    let approved = 0;
    let live = 0;
    let blocked = 0;
    setProgress({ scanned: 0, total, approved: 0 });
    try {
      for (;;) {
        const r: BulkResult = await approveHeldBatch(cursor, BATCH);
        if (!r.ok) {
          ui.toast(r.message, "bad");
          break;
        }
        scanned += r.scanned;
        approved += r.approved;
        live += r.live;
        blocked += r.blocked;
        cursor = r.cursor;
        setProgress({ scanned, total: Math.max(total, scanned), approved });
        if (r.done || stopped.current) break;
      }
      const wasStopped = stopped.current;
      finish({
        approved,
        blocked,
        message: `${wasStopped ? "Stopped. " : ""}Approved ${approved.toLocaleString()} work${approved === 1 ? "" : "s"} (${live.toLocaleString()} published now${approved - live ? `, ${(approved - live).toLocaleString()} after the next ingest run` : ""})${blocked ? `. ${blocked.toLocaleString()} left in the queue: they match a hard safety term` : ""}`,
      });
    } catch {
      ui.toast(`${FAILED}${approved ? ` ${approved.toLocaleString()} were approved before it stopped.` : ""}`, "bad");
      router.refresh();
    } finally {
      setBusy(false);
      setProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, total, busy]);

  const value = useMemo<Ctx>(
    () => ({
      tab, ids, total, selected, allInTab, busy, progress, toggle, selectPage, clear, approveSelected, approveAll,
      selectAllInTab: () => (setSelected(new Set(ids)), setAllInTab(true)),
      stop: () => { stopped.current = true; },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, key, total, selected, allInTab, busy, progress, toggle, selectPage, clear, approveSelected, approveAll],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The tick box on a work card. The whole 44px square is the target, not just the 20px box. */
export function SelectBox({ id, title }: { id: number; title: string }) {
  const { selected, toggle, busy } = useBulk();
  return (
    <label className="-m-2.5 grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg transition hover:bg-surface-2/70 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/70">
      <input
        type="checkbox"
        checked={selected.has(id)}
        disabled={busy}
        onChange={() => toggle(id)}
        aria-label={`Select ${title} (#${id})`}
        className="h-[18px] w-[18px] cursor-pointer rounded border-line accent-[rgb(var(--accent-fill))]"
      />
    </label>
  );
}

/** Above the list: tick everything on this page, and (Held only) offer the whole tab. */
export function SelectAllRow() {
  const { ids, total, tab, selected, allInTab, busy, selectPage, selectAllInTab, clear } = useBulk();
  const onPage = ids.filter((id) => selected.has(id)).length;
  const all = ids.length > 0 && onPage === ids.length;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = onPage > 0 && !all;
  }, [onPage, all]);
  if (!ids.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-surface-2/50 px-3.5 py-1.5 text-[13px]">
      <label className="-ml-2 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 font-medium hover:bg-surface-2/70 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/70 lg:min-h-[36px]">
        <input ref={ref} type="checkbox" checked={all} disabled={busy} onChange={(e) => selectPage(e.target.checked)} className="h-[18px] w-[18px] cursor-pointer rounded border-line accent-[rgb(var(--accent-fill))]" />
        Select all {ids.length} on this page
      </label>
      {tab === "held" && all && total > ids.length && !allInTab && (
        <button type="button" onClick={selectAllInTab} disabled={busy} className="c-tap font-semibold text-accent hover:underline">
          Select all {total.toLocaleString()} in Held
        </button>
      )}
      {allInTab && (
        <span className="text-muted">
          All <b className="text-text">{total.toLocaleString()}</b> works in Held are selected.{" "}
          <button type="button" onClick={clear} className="c-tap font-semibold text-accent hover:underline">Clear</button>
        </span>
      )}
    </div>
  );
}

/** Sticks to the bottom of the list while anything is selected: the count, Approve, and progress for a long run. */
export function ActionBar() {
  const { selected, allInTab, total, tab, busy, progress, approveSelected, approveAll, clear, stop } = useBulk();
  const n = selected.size;
  if (!n && !busy) return null;
  const pct = progress ? Math.min(100, Math.round((progress.scanned / Math.max(1, progress.total)) * 100)) : 0;
  return (
    <div role="region" aria-label="Bulk actions" className="c-rise sticky bottom-4 z-30 mt-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-line bg-surface-2 p-3 shadow-card ring-1 ring-black/20 sm:flex-row sm:items-center sm:p-3.5">
        {progress ? (
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-[13px] font-semibold">
              Approving… {progress.scanned.toLocaleString()} of {progress.total.toLocaleString()} checked
              <span className="font-normal text-muted"> · {progress.approved.toLocaleString()} approved</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Approval progress">
              <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <p className="min-w-0 flex-1 text-[13px] font-semibold" aria-live="polite">
            {allInTab ? `All ${total.toLocaleString()} in Held` : `${n.toLocaleString()} selected`}
            <span className="font-normal text-muted"> · approve them in one go</span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {progress ? (
            <button type="button" onClick={stop} className="c-btn-default"><X className="h-3.5 w-3.5" aria-hidden="true" /> Stop</button>
          ) : (
            <>
              <button type="button" onClick={clear} className="c-btn-ghost">Clear</button>
              {allInTab && tab === "held" ? (
                <button type="button" onClick={approveAll} disabled={busy} className="c-btn-good">
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Approve all {total.toLocaleString()}
                </button>
              ) : (
                <button type="button" onClick={approveSelected} disabled={busy} className="c-btn-good">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                  Approve {n.toLocaleString()} selected
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
