import type { Metadata } from "next";
import Link from "next/link";
import { HelpCircle, Search as SearchIcon } from "lucide-react";
import { currentPrefs } from "@/lib/prefs-server";
import { countWorks, listWorks, popularTags, prefFilters, resolveTerms } from "@/lib/queries";
import { isEmptyQuery, parseQuery } from "@/lib/search";
import { parseFilters } from "@/lib/filters";
import { redirect } from "next/navigation";
import { flatParams, withQuery } from "@/lib/url";
import { PAGE_SIZE } from "@/lib/site";
import { compact, tagHref } from "@/lib/format";
import { FilterBar } from "@/components/work/FilterBar";
import { EmptyState, WorkGrid } from "@/components/work/WorkCard";
import { Pagination } from "@/components/work/Pagination";
import { PageHeading } from "@/components/work/Section";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const q = flatParams(await searchParams).q?.trim();
  // result pages are infinite and thin: keep them out of the index
  return { title: q ? `Search: ${q}` : "Search", robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = flatParams(await searchParams);
  const q = (sp.q ?? "").trim().slice(0, 200);
  const prefs = await currentPrefs();
  const f = parseFilters(sp, prefs);
  const parsed = parseQuery(q);
  const empty = isEmptyQuery(parsed);

  const form = (
    <form action="/search" role="search" className="relative mb-6">
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input name="q" defaultValue={q} autoFocus={!q} placeholder='Try: school  tag:"big breasts"  -tag:netorare  pages:>20' aria-label="Search" className="h-14 w-full rounded-2xl border border-line bg-surface-2/70 pl-12 pr-28 text-base placeholder:text-muted/70 focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30" />
      <button className="btn-primary absolute right-2 top-1/2 h-10 -translate-y-1/2 !min-h-0 px-5">Search</button>
    </form>
  );

  if (empty) {
    const tags = await popularTags("TAG", 24);
    return (
      <div className="container-x max-w-3xl py-6 sm:py-10">
        <PageHeading title="Search" sub="Titles, tags, artists, parodies and more" />
        {form}
        <Link href="/search/help" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
          <HelpCircle className="h-4 w-4" /> How to write advanced searches
        </Link>
        <h2 className="section-title mb-4">Popular tags</h2>
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t.id}>
              <Link href={tagHref("tag", t.slug)} className="chip min-h-[38px] px-3.5">
                {t.name} <span className="text-xs font-normal text-muted">{compact(t.count)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const r = await resolveTerms(parsed.terms);
  const hide = prefFilters(prefs).exclude ?? [];
  const opts = {
    sort: f.sort,
    include: r.include,
    exclude: [...r.exclude, ...hide],
    text: parsed.text,
    excludeText: parsed.excludeText,
    pages: parsed.pages,
    uploaded: parsed.uploaded,
    langs: f.langs.length ? f.langs : undefined,
    categories: f.cats.length ? f.cats : undefined,
    page: f.page,
  };
  const noMatch = r.missing.length > 0; // a required tag that does not exist can match nothing
  const [{ items, hasNext }, total] = noMatch ? [{ items: [], hasNext: false }, { n: 0, capped: false }] : await Promise.all([listWorks(opts), countWorks(opts)]);

  if (!items.length && f.page > 1 && !noMatch) redirect(withQuery("/search", sp, { page: undefined }));

  return (
    <div className="container-x py-6 sm:py-10">
      <PageHeading title={`Results for "${q}"`} sub={noMatch ? undefined : `${total.n.toLocaleString()}${total.capped ? "+" : ""} works`} eyebrow="Search" />
      {form}
      <FilterBar base="/search" params={sp} sort={f.sort} langs={f.langs} cats={f.cats} />
      <div className="mt-6 sm:mt-8">
        {items.length ? (
          <>
            <WorkGrid works={items} />
            <Pagination base="/search" params={sp} page={f.page} hasNext={hasNext} totalPages={Math.ceil(total.n / PAGE_SIZE)} />
          </>
        ) : (
          <EmptyState title="No results" hint={noMatch ? `We have no ${r.missing.map((m) => `"${m}"`).join(", ")}. Check the spelling, or browse the tag list.` : "Try fewer words, or remove a filter."}>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Link href="/tags" className="btn-soft">
                Browse tags
              </Link>
              <Link href="/search/help" className="btn-ghost">
                Search help
              </Link>
            </div>
          </EmptyState>
        )}
      </div>
    </div>
  );
}
