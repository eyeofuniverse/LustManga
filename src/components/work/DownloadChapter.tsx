"use client";

import { useRef, useState } from "react";
import { Check, Download, Loader2, X } from "lucide-react";
import { buildCbz, safeFileName, saveBlob } from "@/lib/cbz";
import { SITE_URL } from "@/lib/site";
import { workHref } from "@/lib/format";

/** A chapter this large would not fit comfortably in a phone's memory while it is zipped. */
const MAX_BYTES = 450 * 1024 * 1024;

interface PageList {
  title: string;
  number: number;
  chapters: number;
  pages: { src: string }[];
  bytes: number;
}

type State = { kind: "idle" } | { kind: "working"; done: number; total: number } | { kind: "done" } | { kind: "error"; message: string };

/**
 * "Download as CBZ": fetches the chapter's pages and zips them in the browser, so it costs the server nothing and
 * works with any comic reader. Pass `pages` when they are already known (the reader); otherwise they are looked up.
 */
export function DownloadChapter({
  publicId,
  slug,
  chapter,
  pages,
  title,
  variant = "soft",
  label = "Download",
}: {
  publicId: number;
  slug: string;
  chapter: number;
  pages?: { src: string }[];
  title?: string;
  variant?: "soft" | "icon" | "row";
  label?: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);
  const busy = state.kind === "working";

  const run = async () => {
    if (busy) {
      abort.current?.abort();
      return;
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setState({ kind: "working", done: 0, total: pages?.length ?? 0 });
    try {
      let list: PageList = { title: title ?? "", number: chapter, chapters: 1, pages: pages ?? [], bytes: 0 };
      if (!pages) {
        const r = await fetch(`/api/pages?id=${publicId}&chapter=${chapter}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(r.status === 429 ? "Too many downloads at once. Try again in a minute." : "Could not load this chapter.");
        list = (await r.json()) as PageList;
      }
      if (!list.pages.length) throw new Error("This chapter has no pages.");
      if (list.bytes > MAX_BYTES) throw new Error(`This chapter is ${Math.round(list.bytes / 1048576)} MB, too big to build in the browser. Read it online instead.`);
      setState({ kind: "working", done: 0, total: list.pages.length });
      const name = list.chapters > 1 ? `${list.title} - Chapter ${list.number}` : list.title;
      const blob = await buildCbz({
        pages: list.pages,
        info: { title: name, series: list.title, number: list.chapters > 1 ? String(list.number) : undefined, pageCount: list.pages.length, web: `${SITE_URL}${workHref({ publicId, slug })}` },
        onProgress: (done, total) => setState({ kind: "working", done, total }),
        signal: ctrl.signal,
      });
      saveBlob(blob, `${safeFileName(name)}.cbz`);
      setState({ kind: "done" });
      setTimeout(() => setState({ kind: "idle" }), 4000);
    } catch (e) {
      if (ctrl.signal.aborted) return setState({ kind: "idle" });
      setState({ kind: "error", message: e instanceof Error && e.message ? e.message : "The download failed. Try again." });
    }
  };

  const progress = state.kind === "working" && state.total ? `${state.done} / ${state.total}` : "";
  const text = busy ? (progress ? `Downloading ${progress}. Tap to cancel` : "Preparing. Tap to cancel") : state.kind === "done" ? "Downloaded" : label;
  const icon = busy ? <Loader2 className="h-4 w-4 animate-spin" /> : state.kind === "done" ? <Check className="h-4 w-4 text-good" /> : state.kind === "error" ? <X className="h-4 w-4 text-red-400" /> : <Download className="h-4 w-4" />;
  const cls = variant === "icon" ? "btn-icon h-10 w-10" : variant === "row" ? "btn-ghost h-10 !min-h-0 px-3 text-xs" : "btn-soft h-12";

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={run} className={cls} aria-label={variant === "icon" ? `${text} (CBZ file)` : undefined} title={variant === "icon" ? "Download as CBZ" : undefined}>
        {icon}
        {variant !== "icon" && <span>{text}</span>}
      </button>
      {state.kind === "error" && (
        <span role="alert" className="max-w-xs text-xs text-red-400">
          {state.message}
        </span>
      )}
    </span>
  );
}
