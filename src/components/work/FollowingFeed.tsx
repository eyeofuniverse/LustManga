"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellPlus, Loader2, X } from "lucide-react";
import { useFollows } from "@/lib/library";
import { tagHref } from "@/lib/format";
import type { WorkCard as Work } from "@/lib/types";
import { EmptyState, GridSkeleton, WorkCard } from "./WorkCard";
import { PageHeading } from "./Section";

/** New works from the tags, artists and circles the visitor follows. The follow list lives in this browser. */
export function FollowingFeed() {
  const { items: follows, toggle } = useFollows();
  const key = follows.map((f) => f.id).join(",");
  const [works, setWorks] = useState<Work[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!key) {
      setWorks([]);
      setMore(false);
      return;
    }
    const ctrl = new AbortController();
    setPage(1);
    fetch(`/api/following?ids=${key}&page=1`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ items: Work[]; hasNext: boolean }>)
      .then((d) => {
        setWorks(d.items);
        setMore(d.hasNext);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [key]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const d = (await (await fetch(`/api/following?ids=${key}&page=${page + 1}`)).json()) as { items: Work[]; hasNext: boolean };
      setWorks((w) => [...(w ?? []), ...d.items.filter((x) => !(w ?? []).some((y) => y.publicId === x.publicId))]);
      setMore(d.hasNext);
      setPage((p) => p + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-x py-6 sm:py-10">
      <PageHeading title="Following" sub="New works from the tags, artists and circles you follow. Stored on this device.">
        <div className="flex gap-2">
          <Link href="/favorites" className="btn-soft">
            Saved
          </Link>
          <Link href="/history" className="btn-soft">
            History
          </Link>
        </div>
      </PageHeading>

      {follows.length > 0 && (
        <ul className="mb-8 flex flex-wrap gap-2" aria-label="Followed">
          {follows.map((f) => (
            <li key={f.id} className="chip chip-active !gap-0 !p-0">
              <Link href={tagHref(f.type, f.slug)} className="px-3 py-1.5">
                {f.name}
              </Link>
              <button type="button" onClick={() => toggle(f)} aria-label={`Unfollow ${f.name}`} className="grid h-8 w-8 place-items-center rounded-r-lg hover:bg-black/20">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {works === null ? (
        <GridSkeleton n={12} />
      ) : follows.length === 0 ? (
        <EmptyState title="You are not following anything yet" hint="Open a tag, artist or circle and tap Follow. New works from them show up here.">
          <Link href="/artists" className="btn-primary mt-2">
            <BellPlus className="h-4 w-4" /> Find artists to follow
          </Link>
        </EmptyState>
      ) : works.length === 0 ? (
        <EmptyState title="Nothing new yet" hint="Nothing matches what you follow and your language settings right now." />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {works.map((w, i) => (
              <li key={w.publicId}>
                <WorkCard work={w} index={i % 24} />
              </li>
            ))}
          </ul>
          {more && (
            <div className="mt-10 flex justify-center">
              <button type="button" onClick={loadMore} disabled={busy} className="btn-soft h-12 px-8">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
