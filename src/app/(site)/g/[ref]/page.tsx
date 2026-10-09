import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CalendarDays, FileText, Languages, Layers, Star } from "lucide-react";
import { currentPrefs } from "@/lib/prefs-server";
import { getMoreBy, getRelated, getVariants, getWork } from "@/lib/queries";
import { categoryHref, categoryLabel, compact, langLabel, tagHref, timeAgo, workHref } from "@/lib/format";
import { cdn } from "@/lib/cdn";
import { cleanDescription } from "@/lib/text";
import { idParam } from "@/lib/url";
import { findRedirect } from "@/lib/redirects";
import { breadcrumbLd, hreflangFor, ldJson, socialMeta, titleCase, workDescription, workLd, workTitle, type WorkForSeo } from "@/lib/seo";
import { CoverImage } from "@/components/work/CoverImage";
import { ChapterList } from "@/components/work/ChapterList";
import { DownloadChapter } from "@/components/work/DownloadChapter";
import { FavoriteButton, ReadButton, ReportLink, ShareButton, ViewPing } from "@/components/work/Actions";
import { ScrollRow } from "@/components/work/ScrollRow";
import { WorkCard } from "@/components/work/WorkCard";
import { SectionHeader } from "@/components/work/Section";

type Params = Promise<{ ref: string }>;
const idOf = (ref: string) => idParam(ref);

/** What the SEO helpers need to know about a work, from the loaded page data. */
const forSeo = (w: NonNullable<Awaited<ReturnType<typeof getWork>>>): WorkForSeo => ({
  publicId: w.publicId,
  slug: w.slug,
  title: w.title,
  titleOriginal: w.titleOriginal,
  description: cleanDescription(w.description),
  language: w.language,
  category: w.category,
  pageCount: w.pageCount,
  coverKey: w.coverKey,
  createdAt: w.createdAt,
  tags: w.tags,
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = idOf((await params).ref);
  const w = id ? await getWork(id) : null;
  if (!w) return { title: "Not found", robots: { index: false, follow: false } };
  const seo = forSeo(w);
  const title = workTitle(seo);
  const description = workDescription(seo);
  const path = workHref(w);
  // translations of the same work point at each other, so a reader is sent to the copy in their language
  const variants = await getVariants(w.translationGroupId, w.id);
  const languages = hreflangFor(w, variants);
  return {
    title,
    description,
    alternates: { canonical: path, ...(Object.keys(languages).length ? { languages } : {}) },
    // the share card comes from opengraph-image.tsx in this folder
    ...socialMeta({ title, description, path, type: "book", image: false }),
  };
}

const GROUPS: { type: string; label: string }[] = [
  { type: "PARODY", label: "Parodies" },
  { type: "CHARACTER", label: "Characters" },
  { type: "TAG", label: "Tags" },
  { type: "ARTIST", label: "Artists" },
  { type: "GROUP", label: "Groups" },
];

export default async function WorkPage({ params }: { params: Params }) {
  const { ref } = await params;
  const id = idOf(ref);
  if (!id) notFound();
  const w = await getWork(id);
  if (!w) {
    // a work merged into another keeps sending visitors (and search engines) to the one that survived
    const to = await findRedirect(`/g/${id}`);
    if (to) permanentRedirect(to);
    notFound();
  }
  if (decodeURIComponent(ref) !== `${w.publicId}-${w.slug || "work"}`) permanentRedirect(workHref(w));

  const prefs = await currentPrefs();
  const [variants, related, moreBy] = await Promise.all([getVariants(w.translationGroupId, w.id), getRelated(w, prefs), getMoreBy(w, prefs)]);
  const chapterNumbers = w.chapters.map((c) => c.number);
  const cover = cdn(w.coverKey);
  const artists = (w.byType.ARTIST ?? []).map((t) => t.name);
  const about = cleanDescription(w.description);

  const ld = [
    workLd(forSeo(w), { kind: w.kind, cover, variants, chapters: w.chapters.length }),
    breadcrumbLd([{ name: "Home", path: "/" }, { name: "Browse", path: "/browse" }, { name: w.title, path: workHref(w) }]),
  ];

  return (
    <div className="container-x py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <ViewPing publicId={w.publicId} />

      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        <Link href="/" className="hover:text-accent">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href={categoryHref(w.category)} className="hover:text-accent">{categoryLabel(w.category)}</Link>
        <span aria-hidden="true">/</span>
        <span className="line-clamp-1 text-text">{w.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="mx-auto w-full max-w-[260px] sm:max-w-[300px] lg:sticky lg:top-24 lg:max-w-none lg:self-start">
          <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 shadow-[0_30px_80px_-24px_rgb(0_0_0/0.75)] ring-1 ring-line">
            <CoverImage coverKey={w.coverKey} priority small={false} alt={`Cover of ${w.title}`} />
          </div>
        </aside>

        <div className="min-w-0 space-y-7">
          <header className="space-y-3 text-center lg:text-left">
            <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl lg:text-4xl">{w.title}</h1>
            {w.titleOriginal && w.titleOriginal !== w.title && <p className="text-sm text-muted sm:text-base">{w.titleOriginal}</p>}
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted lg:justify-start" aria-label="Details">
              <li className="inline-flex items-center gap-1.5"><Languages className="h-4 w-4" /> {langLabel(w.language)}</li>
              <li className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4" /> {categoryLabel(w.category)}</li>
              <li className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" /> {w.pageCount} pages</li>
              <li className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Added {timeAgo(w.createdAt)}</li>
              {w.srcRating != null && w.srcVotes > 0 && (
                <li className="inline-flex items-center gap-1.5" title="Average reader rating from the source sites, adjusted so sites that rate everything highly do not outrank the rest">
                  <Star className="h-4 w-4 text-warn" /> {w.srcRating.toFixed(1)}/10 <span className="text-xs">({compact(w.srcVotes)} votes)</span>
                </li>
              )}
            </ul>
          </header>

          <div className="flex flex-wrap items-stretch justify-center gap-2.5 lg:justify-start">
            <ReadButton publicId={w.publicId} chapters={chapterNumbers} />
            <FavoriteButton publicId={w.publicId} count={w.favorites} />
            <ShareButton title={w.title} />
            {w.chapters.length === 1 && <DownloadChapter publicId={w.publicId} slug={w.slug} chapter={w.chapters[0].number} />}
            <ReportLink publicId={w.publicId} />
          </div>

          {variants.length > 0 && (
            <section aria-label="Other languages">
              <h2 className="mb-2.5 text-sm font-bold uppercase tracking-wider text-muted">Also available in</h2>
              <ul className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <li key={v.publicId}>
                    <Link href={workHref(v)} className="chip min-h-[40px] px-3.5">
                      {langLabel(v.language)}
                      <span className="text-xs font-normal text-muted">{v.pageCount}p</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Tags" className="card divide-y divide-line">
            {GROUPS.filter((g) => w.byType[g.type]?.length).map((g) => (
              <div key={g.type} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[110px_1fr] sm:gap-4">
                <h2 className="pt-1.5 text-xs font-bold uppercase tracking-wider text-muted">{g.label}</h2>
                <ul className="flex flex-wrap gap-1.5">
                  {w.byType[g.type].map((t) => (
                    <li key={t.id}>
                      <Link href={tagHref(g.type.toLowerCase(), t.slug)} className="chip">
                        {t.name}
                        <span className="text-xs font-normal text-muted">{compact(t.count)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {about && (
            <section aria-label="Description">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">About</h2>
              <p className="line-clamp-6 whitespace-pre-line text-[15px] leading-relaxed text-text/90">{about}</p>
            </section>
          )}

          {w.chapters.length > 1 && <ChapterList publicId={w.publicId} slug={w.slug} chapters={w.chapters} />}
        </div>
      </div>

      {moreBy.map(({ tag, items }) => (
        <section key={tag.id} className="pt-14" aria-label={`More from ${tag.name}`}>
          <SectionHeader title={`More from ${titleCase(tag.name)}`} href={tagHref(tag.type.toLowerCase(), tag.slug)} label={`All by ${titleCase(tag.name)}`} />
          <ScrollRow label={`More from ${tag.name}`}>
            {items.map((r, i) => (
              <li key={r.publicId}>
                <WorkCard work={r} index={i} />
              </li>
            ))}
          </ScrollRow>
        </section>
      ))}

      {related.length > 0 && (
        <section className="pt-14" aria-label="Related">
          <SectionHeader title="You might also like" />
          <ScrollRow label="Related works">
            {related.map((r, i) => (
              <li key={r.publicId}>
                <WorkCard work={r} index={i} />
              </li>
            ))}
          </ScrollRow>
        </section>
      )}
    </div>
  );
}
