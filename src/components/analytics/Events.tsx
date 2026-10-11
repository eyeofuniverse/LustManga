"use client";

import { useEffect, useRef } from "react";
import { enqueue, newId, track } from "@/lib/analytics/client";

/** A search that was run, and how many works it found. Zero-result searches are the most useful ones: they are what people want and we do not have. */
export function SearchTracker({ q, results }: { q: string; results: number }) {
  useEffect(() => {
    const t = setTimeout(() => track("search", { label: q, v: results }), 800); // a refresh that lands on the same search is one search
    return () => clearTimeout(t);
  }, [q, results]);
  return null;
}

/** A page that does not exist: which address was asked for. */
export function NotFoundTracker() {
  useEffect(() => track("not_found"), []);
  return null;
}

/**
 * Reading: a chapter was opened, and how far the visitor got. The "end" report is sent when the page is hidden or left and
 * carries the furthest page reached; sending it again with the same id only ever moves that forward. The end card counts as
 * page `total + 1`; a chapter counts as finished when its last page was reached.
 */
export function useReadTracking(work: number, chapter: number, total: number, page: number) {
  const furthest = useRef(1);
  // in an effect, not during render: when the chapter changes, the old chapter must be reported with ITS furthest page first
  useEffect(() => {
    furthest.current = Math.max(furthest.current, Math.min(page, total + 1));
  }, [page, total]);

  useEffect(() => {
    furthest.current = Math.max(1, Math.min(page, total + 1));
    const endId = newId();
    enqueue({ t: "ev", id: newId(), n: "read_start", path: location.pathname, work, v: chapter });
    let sent = 0;
    const end = () => {
      if (furthest.current === sent) return;
      sent = furthest.current;
      // sent at once: this runs as the page goes away, and the 2-second timer would not get the chance
      enqueue({ t: "ev", id: endId, n: "read_end", path: location.pathname, work, v: furthest.current, tot: total }, true);
    };
    const onHide = () => document.visibilityState === "hidden" && end();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", end);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", end);
      end();
    };
    // `page` is read at mount only; later pages arrive through furthest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work, chapter, total]);
}
