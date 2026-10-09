import type { Metadata } from "next";
import Link from "next/link";
import { currentPrefs } from "@/lib/prefs-server";
import { countWorks, listWorks, prefFilters } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";
import { redirect } from "next/navigation";
import { flatParams, withQuery } from "@/lib/url";
import { PAGE_SIZE } from "@/lib/site";
import { FilterBar } from "@/components/work/FilterBar";
import { EmptyState, WorkGrid } from "@/components/work/WorkCard";
import { Pagination } from "@/components/work/Pagination";
import { breadcrumbLd, itemListLd, ldJson, listingMetadata } from "@/lib/seo";
import { PageHeading } from "@/components/work/Section";
import { SORT_OPTIONS } from "@/lib/sorts";

export const generateMetadata = ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> =>
  listingMetadata({
    title: "Browse All Hentai Manga & Doujinshi",
    description: "Browse every hentai manga and doujinshi on LustPages by popularity or newest. Filter by language and category, and read online free.",
    base: "/browse",
    searchParams,
  });

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
  // a page number past the end (an old bookmark, a shrunken list) goes back to the first page instead of an empty screen
  if (!items.length && f.page > 1) redirect(withQuery("/browse", sp, { page: undefined }));

  const ld = [breadcrumbLd([{ name: "Home", path: "/" }, { name: "Browse", path: "/browse" }]), itemListLd(items, (f.page - 1) * PAGE_SIZE)];

  return (
    <div className="container-x py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <PageHeading title="Browse" sub={total.n ? `${total.n.toLocaleString()}${total.capped ? "+" : ""} works` : undefined} eyebrow={SORT_OPTIONS.find((o) => o.value === f.sort)?.hint} />
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
