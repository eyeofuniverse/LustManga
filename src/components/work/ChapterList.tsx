"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownUp, Check, Play } from "lucide-react";
import { isFinished, useHistory } from "@/lib/library";
import { readHref } from "@/lib/format";
import { DownloadChapter } from "./DownloadChapter";

interface Ch {
  number: number;
  title: string | null;
  volume: string | null;
  pageCount: number;
}

/** Chapter list with read marks, "continue here" highlight, newest/oldest toggle and a jump box for long series. */
export function ChapterList({ publicId, slug, chapters }: { publicId: number; slug: string; chapters: Ch[] }) {
  const { byId } = useHistory();
  const h = byId(publicId);
  const [desc, setDesc] = useState(chapters.length > 12);
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);

  const rows = useMemo(() => {
    let r = desc ? [...chapters].reverse() : chapters;
    if (q.trim()) r = r.filter((c) => String(c.number).startsWith(q.trim()) || (c.title ?? "").toLowerCase().includes(q.trim().toLowerCase()));
    return r;
  }, [chapters, desc, q]);
  const shown = all || q ? rows : rows.slice(0, 30);

  return (
    <section aria-label="Chapters" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">
          Chapters <span className="font-sans text-sm font-medium text-muted">({chapters.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {chapters.length > 15 && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              inputMode="numeric"
              placeholder="Jump to #"
              aria-label="Jump to chapter number"
              className="h-10 w-28 rounded-lg border border-line bg-surface-2/70 px-3 text-sm placeholder:text-muted/70 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          )}
          <button type="button" onClick={() => setDesc((d) => !d)} className="btn-soft h-10 !min-h-0 px-3 text-xs" aria-label="Reverse chapter order">
            <ArrowDownUp className="h-4 w-4" /> {desc ? "Newest first" : "Oldest first"}
          </button>
        </div>
      </div>

      <ol className="card divide-y divide-line overflow-hidden">
        {shown.map((c) => {
          const isCurrent = h?.ch === c.number;
          const read = !!h?.done.includes(c.number) && !isCurrent;
          return (
            <li key={c.number} className="relative">
              <Link
                href={readHref(publicId, c.number, isCurrent && h && !isFinished(h) ? h.page : undefined)}
                className={`flex min-h-[56px] items-center gap-3 py-3 pl-4 pr-16 transition hover:bg-surface-2 ${isCurrent ? "bg-accent/10" : ""}`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold ${isCurrent ? "bg-accent-fill text-white" : read ? "bg-good/15 text-good" : "bg-surface-2 text-muted"}`}>
                  {isCurrent ? <Play className="h-4 w-4 fill-current" /> : read ? <Check className="h-4 w-4" /> : c.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${read ? "text-muted" : ""}`}>
                    Chapter {c.number}
                    {c.title ? <span className="font-normal text-muted"> · {c.title}</span> : null}
                  </span>
                  <span className="block text-xs text-muted">
                    {c.volume ? `Vol. ${c.volume} · ` : ""}
                    {c.pageCount} pages
                    {isCurrent && h ? (isFinished(h) ? " · finished" : ` · you are on page ${h.page}`) : ""}
                  </span>
                </span>
              </Link>
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                <DownloadChapter publicId={publicId} slug={slug} chapter={c.number} title={`Chapter ${c.number}`} variant="icon" label={`Download chapter ${c.number}`} />
              </span>
            </li>
          );
        })}
        {!shown.length && <li className="px-4 py-6 text-center text-sm text-muted">No chapter matches.</li>}
      </ol>
      {!all && !q && rows.length > 30 && (
        <button type="button" onClick={() => setAll(true)} className="btn-soft w-full">
          Show all {rows.length} chapters
        </button>
      )}
    </section>
  );
}
