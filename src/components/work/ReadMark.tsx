"use client";

import { Check } from "lucide-react";
import { isFinished, useHistory } from "@/lib/library";

/**
 * Drawn over a card's cover for a work the visitor has opened: a thin progress bar, and a "Read" tag with a dimmed
 * cover once they reached the last page. The history lives in the browser, so this appears just after the page loads.
 */
export function ReadMark({ publicId }: { publicId: number }) {
  const { byId } = useHistory();
  const h = byId(publicId);
  if (!h) return null;
  const done = isFinished(h);
  const pct = Math.min(100, Math.round((h.page / Math.max(h.total, 1)) * 100));
  return (
    <>
      {done && <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/35" />}
      {done && (
        <span className="absolute left-2 top-9 inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-md">
          <Check className="h-3 w-3" aria-hidden="true" /> Read
        </span>
      )}
      {!done && h.page > 1 && (
        <span role="img" aria-label={`Page ${h.page} of ${h.total}`} className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
          <span className="block h-full bg-accent-fill" style={{ width: `${pct}%` }} />
        </span>
      )}
    </>
  );
}
