import { Fragment } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import type { WorkCard as Work } from "@/lib/types";
import { categoryLabel, isNew, workHref } from "@/lib/format";
import { CoverImage } from "./CoverImage";
import { ReadMark } from "./ReadMark";

export function WorkCard({ work, priority = false, index = 0, note }: { work: Work; priority?: boolean; index?: number; /** a line under the title, e.g. the newest chapter */ note?: string }) {
  const href = workHref(work);
  return (
    <article className="group relative animate-rise" style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}>
      <Link href={href} className="block rounded-2xl" aria-label={work.title}>
        <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 shadow-card ring-1 ring-line transition duration-300 group-hover:-translate-y-1 group-hover:shadow-glow group-active:scale-[.98]">
          <CoverImage coverKey={work.coverKey} priority={priority} className="transition duration-700 [@media(hover:hover)]:group-hover:scale-[1.06]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          <span className="absolute left-2 top-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-md">
            {work.language}
          </span>
          {isNew(work.createdAt) && (
            <span className="absolute right-2 top-2 rounded-md bg-accent-fill px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow">New</span>
          )}
          <ReadMark publicId={work.publicId} />
          <span className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] font-semibold text-white/95">
            <span className="rounded-md bg-black/70 px-1.5 py-0.5 backdrop-blur-md">{categoryLabel(work.category)}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 backdrop-blur-md">
              <FileText className="h-3 w-3" aria-hidden="true" />
              {work.pageCount}
            </span>
          </span>
        </div>
        <h3 className="mt-2.5 line-clamp-2 text-[13px] font-semibold leading-snug text-text/95 transition group-hover:text-accent sm:text-sm">{work.title}</h3>
        {note && <p className="mt-0.5 text-xs font-medium text-muted">{note}</p>}
      </Link>
    </article>
  );
}

/**
 * The in-grid ad goes after the 12th work, which ends a row at 2, 3, 4 and 6 columns. At exactly 5 columns (1024 to 1279 px
 * wide) 12 would leave a hole in the row above the ad, so there it goes after the 10th. Both copies are in the page; the
 * one that is not showing is display:none, so it never loads, runs or counts anything.
 */
export const AD_AFTER = 12;
const AD_AFTER_5COL = 10;

/**
 * `breakNode`, when there is one, is shown as a full-width row after the 12th work. The page passes it only when there is
 * something to show (not an empty placeholder), so a grid with no ad has no extra row and no extra spacing. (This file is also
 * used by client components, so it must not import anything server-only: the page builds the node.)
 */
export function WorkGrid({ works, priorityCount = 6, breakNode }: { works: Work[]; priorityCount?: number; breakNode?: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {works.map((w, i) => (
        <Fragment key={w.publicId}>
          <li>
            <WorkCard work={w} index={i} priority={i < priorityCount} />
          </li>
          {breakNode && works.length > AD_AFTER && i === AD_AFTER_5COL - 1 && <li className="col-span-full hidden lg:max-xl:block">{breakNode}</li>}
          {breakNode && works.length > AD_AFTER && i === AD_AFTER - 1 && <li className="col-span-full lg:max-xl:hidden">{breakNode}</li>}
        </Fragment>
      ))}
    </ul>
  );
}

export function GridSkeleton({ n = 12 }: { n?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          <div className="skeleton aspect-[2/3] rounded-2xl" />
          <div className="skeleton mt-3 h-3.5 w-11/12 rounded" />
          <div className="skeleton mt-2 h-3.5 w-2/3 rounded" />
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="card mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden="true">
        ¯\_(ツ)_/¯
      </div>
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {children}
    </div>
  );
}
