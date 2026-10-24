import type { Metadata } from "next";
import Link from "@/components/site/Link";
import { currentPrefs } from "@/lib/prefs-server";
import { categoryCounts, countWorks, listWorks, popularTags, prefFilters, siteStats } from "@/lib/queries";
import { categoryHref, categoryLabel, compact, langLabel } from "@/lib/format";
import { browseLead, libraryParagraph } from "@/lib/blurbs";
import { ChipSection } from "@/components/work/ChipSection";
import { Faq, type QA } from "@/components/seo/Faq";
import { parseFilters } from "@/lib/filters";
import { redirect } from "next/navigation";
import { flatParams, withQuery } from "@/lib/url";
import { PAGE_SIZE } from "@/lib/site";
import { FilterBar } from "@/components/work/FilterBar";
import { EmptyState, WorkGrid } from "@/components/work/WorkCard";
import { AdSlot, AdView } from "@/components/ads/AdSlot";
import { serveAd } from "@/lib/ads/serve";
import { Pagination } from "@/components/work/Pagination";
import { breadcrumbLd, itemListLd, ldJson, listingMetadata } from "@/lib/seo";
import { PageHeading } from "@/components/work/Section";
import { SORT_OPTIONS } from "@/lib/sorts";

/** The same few questions on every list: how it is ordered, how to narrow it, how to find one thing. */
const FAQ: QA[] = [
  {
    q: "How are the lists ordered?",
    text: "Popular is all-time popularity. Trending, This week and This month follow what is climbing the charts. Top rated needs enough votes, Most saved counts readers who saved a work here, and Newest shows the latest additions.",
    a: "Popular is all-time popularity. Trending, This week and This month follow what is climbing the charts. Top rated needs enough votes, Most saved counts readers who saved a work here, and Newest shows the latest additions.",
  },
  {
    q: "How do I narrow the list to what I like?",
    text: "Pick a language and a category above the list, or open a tag, artist, circle, parody or character page. Advanced search lets you include and exclude tags and filter by page count and upload date.",
    a: "Pick a language and a category above the list, or open a tag, artist, circle, parody or character page. Advanced search lets you include and exclude tags and filter by page count and upload date.",
  },
  {
    q: "Do I need an account to read?",
    text: "No. Everything is free to read online, and your saved works and reading history stay in your own browser.",
    a: "No. Everything is free to read online, and your saved works and reading history stay in your own browser.",
  },
];

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
  const [{ items, hasNext }, total, gridAd, stats, cats, languages, tags, artists, parodies] = await Promise.all([
    listWorks(opts),
    countWorks(opts),
    serveAd("list-in-grid"),
    siteStats().catch(() => null),
    categoryCounts().catch(() => []),
    popularTags("LANGUAGE", 16).catch(() => []),
    popularTags("TAG", 30).catch(() => []),
    popularTags("ARTIST", 18).catch(() => []),
    popularTags("PARODY", 18).catch(() => []),
  ]);
  // a page number past the end (an old bookmark, a shrunken list) goes back to the first page instead of an empty screen
  if (!items.length && f.page > 1) redirect(withQuery("/browse", sp, { page: undefined }));

  const sortOpt = SORT_OPTIONS.find((o) => o.value === f.sort) ?? SORT_OPTIONS[0];
  const lead = browseLead({ total: total.n, sortLabel: sortOpt.label, languages: f.langs.map(langLabel), categories: f.cats.map(categoryLabel) });
  const pages = Math.ceil(total.n / PAGE_SIZE);
  const ld = [breadcrumbLd([{ name: "Home", path: "/" }, { name: "Browse", path: "/browse" }]), itemListLd(items, (f.page - 1) * PAGE_SIZE)];

  return (
    <div className="container-x py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <PageHeading title="Browse" sub={total.n ? `${total.n.toLocaleString()}${total.capped ? "+" : ""} works` : undefined} eyebrow={SORT_OPTIONS.find((o) => o.value === f.sort)?.hint} />
      <p className="-mt-3 mb-5 max-w-3xl text-sm leading-relaxed text-muted sm:-mt-5 sm:mb-6 sm:text-[15px]">{lead}{f.page > 1 ? ` Page ${f.page} of ${pages}.` : ""}</p>
      <FilterBar base="/browse" params={sp} sort={f.sort} langs={f.langs} cats={f.cats} />
      <div className="mt-6 sm:mt-8">
        {items.length ? (
          <>
            <AdSlot slot="list-top" className="mb-6 sm:mb-8" />
            <WorkGrid works={items} breakNode={gridAd ? <AdView ad={gridAd} className="py-2" /> : null} />
            <Pagination base="/browse" params={sp} page={f.page} hasNext={hasNext} totalPages={Math.ceil(total.n / PAGE_SIZE)} />
            <AdSlot slot="list-footer" className="mt-10" />
            {f.page === 1 && (
              <>
            <section className="mt-14 border-t border-line pt-10" aria-label="About this library">
              <h2 className="section-title">Browse the whole library</h2>
              {stats && <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">{libraryParagraph(stats)}</p>}
              <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SORT_OPTIONS.map((o) => (
                  <div key={o.value} className="rounded-xl bg-surface-2/50 px-4 py-3 ring-1 ring-line">
                    <dt className="text-sm font-bold">{o.label}</dt>
                    <dd className="mt-0.5 text-sm leading-snug text-muted">{o.hint}</dd>
                  </div>
                ))}
              </dl>
              {cats.length > 0 && (
                <div className="mt-10">
                  <h2 className="section-title mb-4">By category</h2>
                  <ul className="flex flex-wrap gap-2">
                    {cats.map((c) => (
                      <li key={c.category}>
                        <Link href={categoryHref(c.category)} className="chip min-h-[38px] px-3.5">
                          {categoryLabel(c.category)}
                          <span className="text-xs font-normal text-muted">{compact(c.n)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ChipSection className="pt-10" title="By language" type="language" items={languages} />
              <ChipSection className="pt-10" title="Popular tags" type="tag" items={tags} href="/tags" label="All tags" />
              <ChipSection className="pt-10" title="Popular artists" type="artist" items={artists} href="/artists" label="All artists" />
              <ChipSection className="pt-10" title="Popular parodies" type="parody" items={parodies} href="/parodies" label="All parodies" />
            </section>
            <Faq className="pt-12" items={FAQ} />
              </>
            )}
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
