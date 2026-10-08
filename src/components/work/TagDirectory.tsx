import Link from "next/link";
import { Search } from "lucide-react";
import type { TagType } from "@prisma/client";
import { listTags } from "@/lib/queries";
import { compact, tagHref } from "@/lib/format";
import { flatParams, intParam, withQuery } from "@/lib/url";
import { Pagination } from "./Pagination";
import { PageHeading } from "./Section";

const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

/** An A-Z / popularity index of one kind of tag (tags, artists, parodies...). */
export async function TagDirectory({
  type,
  slug,
  title,
  sub,
  base,
  searchParams,
  tabs,
}: {
  type: TagType;
  slug: string;
  title: string;
  sub: string;
  base: string;
  searchParams: Record<string, string | string[] | undefined>;
  tabs?: { label: string; href: string; active: boolean }[];
}) {
  const sp = flatParams(searchParams);
  const page = intParam(sp.page);
  const sort = sp.sort === "name" ? "name" : "popular";
  const letter = sp.letter && LETTERS.includes(sp.letter.toUpperCase()) ? sp.letter.toUpperCase() : undefined;
  const q = (sp.q ?? "").trim().slice(0, 60) || undefined;
  const { items, hasNext } = await listTags({ type, q, sort, page, letter, pageSize: 120 });
  const h = (patch: Record<string, string | undefined>) => withQuery(base, sp, { page: undefined, ...patch });

  return (
    <div className="container-x py-6 sm:py-10">
      <PageHeading title={title} sub={sub} />

      {tabs && (
        <div className="mb-5 inline-flex rounded-xl bg-surface-2 p-1" role="tablist">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} role="tab" aria-selected={t.active} className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold transition ${t.active ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}>
              {t.label}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <form action={base} role="search" className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
          <input name="q" defaultValue={q} placeholder={`Filter ${title.toLowerCase()}`} aria-label={`Filter ${title.toLowerCase()}`} className="h-11 w-full rounded-xl border border-line bg-surface-2/70 pl-10 pr-3 text-sm placeholder:text-muted/80 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30" />
        </form>
        <div className="inline-flex rounded-xl bg-surface-2 p-1" role="group" aria-label="Sort">
          <Link href={h({ sort: undefined })} className={`inline-flex h-10 items-center rounded-lg px-3.5 text-sm font-semibold ${sort === "popular" ? "bg-surface shadow-sm" : "text-muted hover:text-text"}`}>
            Popular
          </Link>
          <Link href={h({ sort: "name" })} className={`inline-flex h-10 items-center rounded-lg px-3.5 text-sm font-semibold ${sort === "name" ? "bg-surface shadow-sm" : "text-muted hover:text-text"}`}>
            A to Z
          </Link>
        </div>
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0" role="group" aria-label="Jump to letter">
        <div className="flex w-max gap-1 sm:w-auto sm:flex-wrap">
          <Link href={h({ letter: undefined })} className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-xs font-bold ${!letter ? "bg-accent-fill text-white" : "bg-surface-2 text-muted hover:text-text"}`}>
            All
          </Link>
          {LETTERS.map((l) => (
            <Link key={l} href={h({ letter: l, sort: "name" })} className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-xs font-bold ${letter === l ? "bg-accent-fill text-white" : "bg-surface-2 text-muted hover:text-text"}`}>
              {l}
            </Link>
          ))}
        </div>
      </div>

      {items.length ? (
        <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((t) => (
            <li key={t.id}>
              <Link href={tagHref(slug, t.slug)} className="group flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 py-2 transition hover:bg-surface-2">
                <span className="truncate text-sm font-medium group-hover:text-accent">{t.name}</span>
                <span className="shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted group-hover:bg-surface-3">{compact(t.count)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-12 text-center text-muted">Nothing found.</p>
      )}
      <Pagination base={base} params={sp} page={page} hasNext={hasNext} />
    </div>
  );
}
