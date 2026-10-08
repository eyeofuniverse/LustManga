import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { withQuery } from "@/lib/url";

/**
 * Prev / next with page numbers when the total is known. Server-rendered links, so it works without JavaScript and
 * every page is crawlable.
 */
export function Pagination({
  base,
  params,
  page,
  hasNext,
  totalPages,
}: {
  base: string;
  params: Record<string, string | undefined>;
  page: number;
  hasNext: boolean;
  totalPages?: number;
}) {
  if (page === 1 && !hasNext) return null;
  const href = (p: number) => withQuery(base, params, { page: p <= 1 ? undefined : p });

  // 1 … 4 5 [6] 7 8 … 40
  const nums: (number | "gap")[] = [];
  if (totalPages && totalPages > 1) {
    const set = new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= totalPages));
    const sorted = [...set].sort((a, b) => a - b);
    sorted.forEach((n, i) => {
      if (i > 0 && n - sorted[i - 1] > 1) nums.push("gap");
      nums.push(n);
    });
  }

  const arrow = "btn-soft h-11 w-11 !min-h-0 !p-0";
  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={arrow} aria-label="Previous page">
          <ChevronLeft className="h-5 w-5" />
        </Link>
      ) : (
        <span className={`${arrow} opacity-40`} aria-hidden="true">
          <ChevronLeft className="h-5 w-5" />
        </span>
      )}

      {nums.length > 0 ? (
        <>
          <ul className="hidden items-center gap-1.5 sm:flex">
            {nums.map((n, i) =>
              n === "gap" ? (
                <li key={`g${i}`} className="px-1 text-muted" aria-hidden="true">
                  …
                </li>
              ) : (
                <li key={n}>
                  <Link
                    href={href(n)}
                    aria-current={n === page ? "page" : undefined}
                    className={`grid h-11 min-w-11 place-items-center rounded-xl px-3 text-sm font-semibold transition ${n === page ? "bg-accent-fill text-white shadow-[0_8px_24px_-8px_rgb(var(--accent)/0.7)]" : "bg-surface-2 text-text hover:bg-surface-3"}`}
                  >
                    {n}
                  </Link>
                </li>
              ),
            )}
          </ul>
          <span className="px-3 text-sm font-semibold text-muted sm:hidden">
            {page} / {totalPages}
          </span>
        </>
      ) : (
        <span className="px-3 text-sm font-semibold text-muted">Page {page}</span>
      )}

      {hasNext ? (
        <Link href={href(page + 1)} rel="next" className={arrow} aria-label="Next page">
          <ChevronRight className="h-5 w-5" />
        </Link>
      ) : (
        <span className={`${arrow} opacity-40`} aria-hidden="true">
          <ChevronRight className="h-5 w-5" />
        </span>
      )}
    </nav>
  );
}
