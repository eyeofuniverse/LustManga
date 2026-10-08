"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { useHistory } from "@/lib/library";
import { readHref, workHref } from "@/lib/format";
import type { WorkCard } from "@/lib/types";
import { CoverImage } from "./CoverImage";
import { ScrollRow } from "./ScrollRow";
import { SectionHeader } from "./Section";

/** "Pick up where you left off": only appears once the visitor has read something. */
export function ContinueRow() {
  const { items } = useHistory();
  const [cards, setCards] = useState<WorkCard[]>([]);
  const ids = items.slice(0, 10).map((h) => h.id);
  const key = ids.join(",");

  useEffect(() => {
    if (!key) {
      setCards([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/works?ids=${key}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { items: WorkCard[] }) => setCards(d.items))
      .catch(() => {});
    return () => ctrl.abort();
  }, [key]);

  if (!cards.length) return null;
  return (
    <section aria-label="Continue reading" className="container-x pt-8 sm:pt-10">
      <SectionHeader title="Continue reading" href="/history" label="History" />
      <ScrollRow label="Continue reading">
        {cards.map((w) => {
          const h = items.find((x) => x.id === w.publicId)!;
          const pct = Math.min(100, Math.round((h.page / Math.max(h.total, 1)) * 100));
          return (
            <li key={w.publicId}>
              <Link href={readHref(w.publicId, h.ch, h.page)} className="group block" aria-label={`Continue ${w.title} at page ${h.page}`}>
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 shadow-card ring-1 ring-line transition duration-300 group-hover:-translate-y-1 group-hover:shadow-glow">
                  <CoverImage coverKey={w.coverKey} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-fill text-white shadow-lg">
                      <Play className="h-5 w-5 fill-current" />
                    </span>
                  </span>
                  <div className="absolute inset-x-2.5 bottom-2.5">
                    <p className="mb-1.5 text-[11px] font-bold text-white/90">
                      Page {h.page} of {h.total}
                    </p>
                    <div className="h-1 overflow-hidden rounded-full bg-white/25">
                      <div className="h-full rounded-full bg-accent-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
                <h3 className="mt-2.5 line-clamp-1 text-[13px] font-semibold sm:text-sm">{w.title}</h3>
              </Link>
              <Link href={workHref(w)} className="sr-only">
                Details for {w.title}
              </Link>
            </li>
          );
        })}
      </ScrollRow>
    </section>
  );
}
