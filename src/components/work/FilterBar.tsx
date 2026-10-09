import Link from "next/link";
import { Check, Clock, Flame, Heart, Star, TrendingUp } from "lucide-react";
import { CATEGORIES, LANGUAGES } from "@/lib/format";
import { withQuery } from "@/lib/url";
import { SORT_OPTIONS, sortParam, type Sort } from "@/lib/sorts";

/**
 * Sort, language and category filters as plain links: they work without JavaScript, are shareable URLs, and
 * scroll horizontally on phones instead of wrapping into a wall of chips.
 */
export function FilterBar({
  base,
  params,
  sort,
  langs,
  cats,
  showCategories = true,
}: {
  base: string;
  params: Record<string, string | undefined>;
  sort: Sort;
  /** languages currently applied (from the URL or the visitor's saved choice) */
  langs: string[];
  cats: string[];
  showCategories?: boolean;
}) {
  const h = (patch: Record<string, string | undefined>) => withQuery(base, params, { page: undefined, ...patch });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const seg = (active: boolean) =>
    `inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition ${active ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`;

  return (
    <div className="space-y-3">
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0" role="group" aria-label="Sort order">
        <div className="inline-flex w-max rounded-xl bg-surface-2 p-1">
          {SORT_OPTIONS.map((o) => (
            <Link key={o.value} href={h({ sort: sortParam(o.value) })} title={o.hint} className={seg(sort === o.value)} aria-current={sort === o.value ? "true" : undefined}>
              {o.value === "popular" ? <Flame className="h-4 w-4" /> : o.value === "new" ? <Clock className="h-4 w-4" /> : o.value === "saved" ? <Heart className="h-4 w-4" /> : o.value === "rated" ? <Star className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              {o.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0" role="group" aria-label="Languages">
        <div className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap">
          <Link href={h({ lang: "all" })} className={`chip min-h-[36px] ${langs.length === 0 ? "chip-active" : ""}`} aria-current={langs.length === 0 ? "true" : undefined}>
            All languages
          </Link>
          {/* the ten most common, plus any other language that is switched on so it can be switched off again */}
          {[...LANGUAGES.slice(0, 10), ...LANGUAGES.slice(10).filter((l) => langs.includes(l.code))].map((l) => {
            const on = langs.includes(l.code);
            const next = toggle(langs, l.code);
            return (
              <Link key={l.code} href={h({ lang: next.length ? next.join(",") : "all" })} className={`chip min-h-[36px] ${on ? "chip-active" : ""}`} aria-current={on ? "true" : undefined}>
                {on && <Check className="h-3.5 w-3.5" />}
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>

      {showCategories && (
        <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0" role="group" aria-label="Categories">
          <div className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap">
            <Link href={h({ cat: undefined })} className={`chip min-h-[36px] ${cats.length === 0 ? "chip-active" : ""}`}>
              Everything
            </Link>
            {CATEGORIES.map((c) => {
              const on = cats.includes(c.value);
              const next = toggle(cats, c.value);
              return (
                <Link key={c.value} href={h({ cat: next.length ? next.join(",") : undefined })} className={`chip min-h-[36px] ${on ? "chip-active" : ""}`} aria-current={on ? "true" : undefined}>
                  {c.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
