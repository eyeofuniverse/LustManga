import type { Metadata } from "next";
import Link from "next/link";
import { currentPrefs } from "@/lib/prefs-server";
import { countWorks, listWorks, prefFilters } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";
import { flatParams } from "@/lib/url";
import { PAGE_SIZE } from "@/lib/site";
import { FilterBar } from "@/components/work/FilterBar";
import { EmptyState, WorkGrid } from "@/components/work/WorkCard";
import { Pagination } from "@/components/work/Pagination";
import { PageHeading } from "@/components/work/Section";

export const metadata: Metadata = {
  title: "Browse manga & doujinshi",
  description: "Browse every manga and doujinshi by popularity or newest, in any language.",
  alternates: { canonical: "/browse" },
};

export default async function Browse({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = flatParams(await searchParams);
  const prefs = await currentPrefs();
  const f = parseFilters(sp, prefs);
  const opts = {
    sort: f.sort,
    langs: f.langs.length ? f.langs : undefined,
    categories: f.cats.length ? f.cats : undefined,
    exclude: prefFilters(prefs).exclude,
    page: f.page,
  };
  const [{ items, hasNext }, total] = await Promise.all([listWorks(opts), countWorks(opts)]);

  return (
    <div className="container-x py-6 sm:py-10">
      <PageHeading title="Browse" sub={total.n ? `${total.n.toLocaleString()}${total.capped ? "+" : ""} works` : undefined} eyebrow={f.sort === "new" ? "Newest first" : "Most popular first"} />
      <FilterBar base="/browse" params={sp} sort={f.sort} langs={f.langs} cats={f.cats} />
      <div className="mt-6 sm:mt-8">
        {items.length ? (
          <>
            <WorkGrid works={items} />
            <Pagination base="/browse" params={sp} page={f.page} hasNext={hasNext} totalPages={Math.ceil(total.n / PAGE_SIZE)} />
          </>
        ) : (
          <EmptyState title="No works match these filters" hint="Try another language or category.">
            <Link href="/browse?lang=all" className="btn-primary mt-2">
              Clear filters
            </Link>
          </EmptyState>
        )}
      </div>
    </div>
  );
}
