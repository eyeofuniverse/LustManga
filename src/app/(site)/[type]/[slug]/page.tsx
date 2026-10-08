import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { currentPrefs } from "@/lib/prefs-server";
import { countWorks, getTag, listWorks, prefFilters, tagTypeOf } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";
import { flatParams, withQuery } from "@/lib/url";
import { PAGE_SIZE } from "@/lib/site";
import { TAG_TYPE_LABEL, tagHref, type TagTypeSlug } from "@/lib/format";
import { FilterBar } from "@/components/work/FilterBar";
import { EmptyState, WorkGrid } from "@/components/work/WorkCard";
import { Pagination } from "@/components/work/Pagination";
import { PageHeading } from "@/components/work/Section";
import { HideTagButton } from "@/components/work/Actions";
import { MIN_INDEXABLE_ENTRIES, breadcrumbLd, itemListLd, ldJson, listingMetadata, tagSeo } from "@/lib/seo";

type Params = Promise<{ type: string; slug: string }>;
const SINGULAR: Record<string, string> = { tag: "Tag", artist: "Artist", group: "Group", parody: "Parody", character: "Character", language: "Language", category: "Category" };

async function load(params: Params) {
  const { type, slug } = await params;
  const t = tagTypeOf(type);
  if (!t) notFound();
  const decoded = decodeURIComponent(slug);
  const tag = await getTag(t, decoded);
  if (!tag) notFound();
  return { type, tag, requested: decoded };
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  try {
    const { type, tag } = await load(params);
    const seo = tagSeo(type, tag.name, tag.count);
    // a language or category is always worth indexing; a tag or artist with a single work only duplicates that work's page
    return listingMetadata({ title: seo.title, description: seo.description, base: tagHref(type, tag.slug), searchParams, count: tag.count, minCount: type === "language" || type === "category" ? 1 : MIN_INDEXABLE_ENTRIES });
  } catch {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
}

export default async function TagPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { type, tag, requested } = await load(params);
  // an old or merged spelling lands on the canonical URL
  if (tag.slug !== requested) permanentRedirect(tagHref(type, tag.slug));

  const sp = flatParams(await searchParams);
  const prefs = await currentPrefs();
  const f = parseFilters(sp, prefs);
  const isLang = type === "language";
  const opts = {
    sort: f.sort,
    include: [tag.id],
    langs: isLang ? undefined : f.langs.length ? f.langs : undefined,
    categories: f.cats.length ? f.cats : undefined,
    exclude: prefFilters(prefs).exclude?.filter((id) => id !== tag.id),
    page: f.page,
  };
  const base = tagHref(type, tag.slug);
  const [{ items, hasNext }, total] = await Promise.all([listWorks(opts), countWorks(opts)]);
  if (!items.length && f.page > 1) redirect(withQuery(base, sp, { page: undefined }));
  const directory = type === "tag" ? "/tags" : type === "artist" || type === "group" ? "/artists" : type === "parody" ? "/parodies" : type === "character" ? "/characters" : "/browse";

  const seo = tagSeo(type, tag.name, tag.count);
  const ld = [
    breadcrumbLd([{ name: "Home", path: "/" }, { name: TAG_TYPE_LABEL[type as TagTypeSlug] ?? "Browse", path: directory }, { name: seo.h1, path: base }]),
    itemListLd(items, (f.page - 1) * PAGE_SIZE),
  ];

  return (
    <div className="container-x py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link href={directory} className="hover:text-accent">
          {TAG_TYPE_LABEL[type as TagTypeSlug] ?? "Browse"}
        </Link>
        <span className="mx-2" aria-hidden="true">/</span>
        <span className="text-text">{seo.h1}</span>
      </nav>
      <PageHeading title={seo.h1} eyebrow={SINGULAR[type]} sub={seo.description}>
        <HideTagButton id={tag.id} name={tag.name} />
      </PageHeading>
      <FilterBar base={base} params={sp} sort={f.sort} langs={isLang ? [] : f.langs} cats={f.cats} />
      <div className="mt-6 sm:mt-8">
        {items.length ? (
          <>
            <WorkGrid works={items} />
            <Pagination base={base} params={sp} page={f.page} hasNext={hasNext} totalPages={Math.ceil(total.n / PAGE_SIZE)} />
          </>
        ) : (
          <EmptyState title="Nothing here with these filters" hint="Try another language or category.">
            <Link href={base + "?lang=all"} className="btn-primary mt-2">
              Show everything for {tag.name}
            </Link>
          </EmptyState>
        )}
      </div>
    </div>
  );
}
