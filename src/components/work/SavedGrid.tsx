"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock, Heart, Play, Trash2, X } from "lucide-react";
import { isFinished, useFavorites, useHistory } from "@/lib/library";
import { readHref, workHref } from "@/lib/format";
import type { WorkCard as Work } from "@/lib/types";
import { WorkCard, GridSkeleton, EmptyState } from "./WorkCard";
import { PageHeading } from "./Section";

/** Favourites and reading history. Both live in this browser; this page just turns the saved ids into cards. */
export function SavedGrid({ kind }: { kind: "favorites" | "history" }) {
  const fav = useFavorites();
  const hist = useHistory();
  const ids = kind === "favorites" ? fav.ids : hist.items.map((h) => h.id);
  const key = ids.join(",");
  const [cards, setCards] = useState<Work[] | null>(null);

  useEffect(() => {
    if (!key) {
      setCards([]);
      return;
    }
    const ctrl = new AbortController();
    // up to 500 saved works: ask in chunks so every one of them shows up, in the saved order
    const all = key.split(",");
    const chunks: string[][] = [];
    for (let i = 0; i < all.length; i += 100) chunks.push(all.slice(i, i + 100));
    Promise.all(chunks.map((c) => fetch(`/api/works?ids=${c.join(",")}`, { signal: ctrl.signal }).then((r) => r.json() as Promise<{ items: Work[] }>)))
      .then((parts) => setCards(parts.flatMap((p) => p.items)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [key]);

  const isFav = kind === "favorites";
  const clear = isFav ? fav.clear : hist.clear;

  return (
    <div className="container-x py-6 sm:py-10">
      <PageHeading title={isFav ? "Saved" : "History"} sub={isFav ? "Works you saved. Stored on this device." : "What you read recently. Stored on this device."}>
        <div className="flex gap-2">
          <Link href={isFav ? "/history" : "/favorites"} className="btn-soft">
            {isFav ? <Clock className="h-4 w-4" /> : <Heart className="h-4 w-4" />} {isFav ? "History" : "Saved"}
          </Link>
          {ids.length > 0 && (
            <button onClick={() => window.confirm(`Clear all ${ids.length} items?`) && clear()} className="btn-ghost">
              <Trash2 className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
      </PageHeading>

      {cards === null ? (
        <GridSkeleton n={Math.min(ids.length || 6, 12)} />
      ) : cards.length === 0 ? (
        <EmptyState title={isFav ? "Nothing saved yet" : "No reading history yet"} hint={isFav ? "Tap the heart on any work to keep it here." : "Works you open in the reader will appear here."}>
          <Link href="/browse" className="btn-primary mt-2">
            Find something to read
          </Link>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {cards.map((w, i) => {
            const h = hist.byId(w.publicId);
            return (
              <li key={w.publicId} className="relative">
                <WorkCard work={w} index={i} />
                {h && h.page > 1 && !isFav && (
                  <Link href={isFinished(h) ? workHref(w) : readHref(w.publicId, h.ch, h.page)} className="btn-soft mt-2 h-10 w-full !min-h-0 text-xs">
                    <Play className="h-3.5 w-3.5 fill-current" /> {isFinished(h) ? "Finished, what's next?" : `Continue, page ${h.page}`}
                  </Link>
                )}
                <button
                  onClick={() => (isFav ? fav.toggle(w.publicId) : hist.remove(w.publicId))}
                  aria-label={`Remove ${w.title}`}
                  className="absolute right-1.5 top-1.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/80 text-white opacity-100 backdrop-blur transition hover:bg-accent-fill [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [li:hover_&]:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
