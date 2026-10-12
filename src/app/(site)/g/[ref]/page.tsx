import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CalendarDays, FileText, Languages, Layers, Star } from "lucide-react";
import { currentPrefs } from "@/lib/prefs-server";
import { getMoreBy, getRelated, getVariants, getWork, hasTitleTwin } from "@/lib/queries";
import { categoryHref, categoryLabel, compact, langLabel, tagHref, timeAgo, workHref } from "@/lib/format";
import { cdn } from "@/lib/cdn";
import { cleanDescription } from "@/lib/text";
import { joinList, longDate, plural, readingTime } from "@/lib/blurbs";
import { synopsis } from "@/lib/synopsis";
import { Faq, type QA } from "@/components/seo/Faq";
import { getMember } from "@/lib/member/session";
import { loadThread, myRating } from "@/lib/member/community-queries";
import { RatingBox } from "@/components/member/RatingBox";
import { Comments } from "@/components/member/Comments";
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
import { AdSlot } from "@/components/ads/AdSlot";

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
  const title = workTitle(seo, await hasTitleTwin(w.id, w.title, w.language));
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

const LINK = "text-accent underline underline-offset-2";

type LoadedWork = NonNullable<Awaited<ReturnType<typeof getWork>>>;
type Variant = Awaited<ReturnType<typeof getVariants>>[number];

/**
 * Questions a reader of this page would ask, answered from what we hold about the work (never a plot, which we do not know).
 * Each answer is given twice: as links for the page and as plain text for the FAQ structured data.
 */
function workFaq(w: LoadedWork, variants: Variant[]): QA[] {
  const out: QA[] = [];
  const chapters = w.chapters.length;
  const last = w.chapters[chapters - 1];
  const artists = w.byType.ARTIST ?? [];
  const circles = w.byType.GROUP ?? [];
  const parody = (w.byType.PARODY ?? []).find((t) => t.name.toLowerCase() !== "original");
  const characters = (w.byType.CHARACTER ?? []).slice(0, 5);
  const themes = (w.byType.TAG ?? []).slice(0, 8);

  const free = `Yes. You can read all ${plural(w.pageCount, "page")} of ${w.title} online for free on LustPages.`;
  out.push({ q: `Can I read ${w.title} for free?`, text: free, a: free });

  const length = `${w.title} has ${plural(w.pageCount, "page")}${chapters > 1 ? ` in ${plural(chapters, "chapter")}${last ? ` (the latest is chapter ${last.number})` : ""}` : ""}, which is ${readingTime(w.pageCount)} of reading at a relaxed pace.`;
  out.push({ q: `How long is ${w.title}?`, text: length, a: length });

  if (artists.length || circles.length) {
    const names = [...artists, ...circles].map((t) => titleCase(t.name));
    const text = `${w.title} is credited to ${joinList(names)}. Their other works are listed on their pages here.`;
    out.push({
      q: `Who made ${w.title}?`,
      text,
      a: (
        <>
          {w.title} is credited to{" "}
          {[...artists.map((t) => ({ t, type: "artist" })), ...circles.map((t) => ({ t, type: "group" }))].map(({ t, type }, i, all) => (
            <span key={`${type}-${t.id}`}>
              <Link href={tagHref(type, t.slug)} className={LINK}>{titleCase(t.name)}</Link>
              {i < all.length - 2 ? ", " : i === all.length - 2 ? " and " : ""}
            </span>
          ))}
          . Their other works are listed on their pages here.
        </>
      ),
    });
  }

  if (parody) {
    const cast = characters.map((t) => titleCase(t.name));
    const text = `${w.title} is tagged as a parody of ${titleCase(parody.name)}${cast.length ? `, with ${joinList(cast)} among the characters` : ""}. ${compact(parody.count)} works on LustPages carry the ${titleCase(parody.name)} tag.`;
    out.push({
      q: `Which series is ${w.title} a parody of?`,
      text,
      a: (
        <>
          {w.title} is tagged as a parody of <Link href={tagHref("parody", parody.slug)} className={LINK}>{titleCase(parody.name)}</Link>
          {cast.length > 0 && <>, with {joinList(cast)} among the characters</>}. {compact(parody.count)} works on LustPages carry the {titleCase(parody.name)} tag.
        </>
      ),
    });
  }

  if (themes.length) {
    const text = `${w.title} is tagged ${joinList(themes.map((t) => titleCase(t.name)))}. Open any tag to see more works with it.`;
    out.push({
      q: `What tags does ${w.title} have?`,
      text,
      a: (
        <>
          {w.title} is tagged{" "}
          {themes.map((t, i) => (
            <span key={t.id}>
              <Link href={tagHref("tag", t.slug)} className={LINK}>{titleCase(t.name)}</Link>
              {i < themes.length - 2 ? ", " : i === themes.length - 2 ? " and " : ""}
            </span>
          ))}
          . Open any tag to see more works with it.
        </>
      ),
    });
  }

  if (variants.length) {
    const langs = variants.map((v) => langLabel(v.language));
    const text = `Yes. This is the ${langLabel(w.language)} edition, and ${w.title} is also on LustPages in ${joinList(langs)}.`;
    out.push({
      q: `Is ${w.title} available in other languages?`,
      text,
      a: (
        <>
          Yes. This is the {langLabel(w.language)} edition, and {w.title} is also on LustPages in{" "}
          {variants.map((v, i) => (
            <span key={v.publicId}>
              <Link href={workHref(v)} className={LINK}>{langLabel(v.language)}</Link>
              {i < variants.length - 2 ? ", " : i === variants.length - 2 ? " and " : ""}
            </span>
          ))}
          .
        </>
      ),
    });
  } else {
    const text = `This is the ${langLabel(w.language)} edition. No other language of ${w.title} is on LustPages yet; new translations show up on this page when they are added.`;
    out.push({ q: `Is ${w.title} available in other languages?`, text, a: text });
  }
  return out;
}

/** One row of the details table. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm sm:grid sm:grid-cols-[130px_1fr] sm:justify-start">
      <dt className="shrink-0 text-xs font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="min-w-0 text-right sm:text-left">{children}</dd>
    </div>
  );
}

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
  const me = await getMember();
  const [variants, related, moreBy, thread, mine] = await Promise.all([
    getVariants(w.translationGroupId, w.id),
    getRelated(w, prefs),
    getMoreBy(w, prefs),
    // the community parts must never take the page down with them
    loadThread(w.id, me?.id ?? null, { sort: "new", page: 1 }).catch(() => ({ items: [], total: 0, topLevel: 0 })),
    myRating(me?.id ?? null, w.id).catch(() => 0),
  ]);
  const chapterNumbers = w.chapters.map((c) => c.number);
  const cover = cdn(w.coverKey);
  const artists = (w.byType.ARTIST ?? []).map((t) => t.name);
  const about = cleanDescription(w.description);
  const kinds = (t: string) => (w.byType[t] ?? []).map((x) => x.name);
  const summary = synopsis({
    publicId: w.publicId,
    title: w.title,
    language: w.language,
    category: w.category,
    pageCount: w.pageCount,
    artists: kinds("ARTIST"),
    circles: kinds("GROUP"),
    parodies: kinds("PARODY"),
    characters: kinds("CHARACTER"),
    tags: kinds("TAG"),
    translations: variants.map((v) => v.language),
  });
  const faq = workFaq(w, variants);
  const langTag = w.byType.LANGUAGE?.[0];
  const latestChapterAt = w.chapters.reduce<Date | null>((m, c) => (c.publishedAt && (!m || c.publishedAt > m) ? c.publishedAt : m), null);

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
                <li className="inline-flex items-center gap-1.5" title="Average reader rating">
                  <Star className="h-4 w-4 text-warn" /> {w.srcRating.toFixed(1)}/10 <span className="text-xs">({compact(w.srcVotes)} votes)</span>
                </li>
              )}
            </ul>
          </header>

          <div className="flex flex-wrap items-stretch justify-center gap-2.5 lg:justify-start">
            <ReadButton publicId={w.publicId} chapters={chapterNumbers} />
            <FavoriteButton publicId={w.publicId} count={w.favorites} />
            <ShareButton title={w.title} publicId={w.publicId} />
            {w.chapters.length === 1 && <DownloadChapter publicId={w.publicId} slug={w.slug} chapter={w.chapters[0].number} />}
            <ReportLink publicId={w.publicId} />
          </div>

          <RatingBox work={w.publicId} sum={w.ratingSum} count={w.ratingCount} mine={mine} signedIn={!!me && !me.banned} next={workHref(w)} />

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

          <AdSlot slot="work-mid" />

          <section aria-label="About this work">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">About {w.title}</h2>
            {about ? (
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-text/90">{about}</p>
            ) : (
              <>
                <p className="text-[15px] leading-relaxed text-text/90">{summary}</p>
                <p className="mt-2 text-xs text-muted">Summary compiled from this work&apos;s tags and details.</p>
              </>
            )}
          </section>

          <section aria-label="Details">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Details</h2>
            <dl className="card divide-y divide-line">
              <Fact label="Title">{w.title}</Fact>
              {w.titleOriginal && w.titleOriginal !== w.title && <Fact label="Original title">{w.titleOriginal}</Fact>}
              <Fact label="Language">
                <Link href={langTag ? tagHref("language", langTag.slug) : `/browse?lang=${w.language}`} className={LINK}>{langLabel(w.language)}</Link>
              </Fact>
              <Fact label="Category">
                <Link href={categoryHref(w.category)} className={LINK}>{categoryLabel(w.category)}</Link>
              </Fact>
              <Fact label="Length">
                {plural(w.pageCount, "page")}
                {w.chapters.length > 1 ? `, ${plural(w.chapters.length, "chapter")}` : ""}
              </Fact>
              <Fact label="Reading time">{readingTime(w.pageCount)}</Fact>
              <Fact label="Added">
                {longDate(w.createdAt)} <span className="text-muted">({timeAgo(w.createdAt)})</span>
              </Fact>
              {latestChapterAt && w.chapters.length > 1 && <Fact label="Latest chapter">{longDate(latestChapterAt)}</Fact>}
              {w.srcRating != null && w.srcVotes > 0 && (
                <Fact label="Rating">
                  {w.srcRating.toFixed(1)}/10 <span className="text-muted">({compact(w.srcVotes)} votes)</span>
                </Fact>
              )}
              {w.favorites > 0 && <Fact label="Saved by">{plural(w.favorites, "reader")} here</Fact>}
            </dl>
          </section>

          {w.chapters.length > 1 && <ChapterList publicId={w.publicId} slug={w.slug} chapters={w.chapters} />}
        </div>
      </div>

      <Comments work={w.publicId} initial={thread.items} total={thread.total} topLevel={thread.topLevel} me={me ? { handle: me.handle, displayName: me.displayName, banned: me.banned } : null} next={workHref(w)} />

      <AdSlot slot="work-footer" className="pt-10" />

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

      <nav className="pt-14" aria-label="Keep exploring">
        <h2 className="section-title mb-4">Keep exploring</h2>
        <ul className="flex flex-wrap gap-2">
          <li><Link href={categoryHref(w.category)} className="chip min-h-[38px] px-3.5">More {categoryLabel(w.category)}</Link></li>
          <li><Link href={langTag ? tagHref("language", langTag.slug) : `/browse?lang=${w.language}`} className="chip min-h-[38px] px-3.5">More in {langLabel(w.language)}</Link></li>
          <li><Link href="/browse?sort=trending" className="chip min-h-[38px] px-3.5">Trending now</Link></li>
          <li><Link href="/updates" className="chip min-h-[38px] px-3.5">Latest updates</Link></li>
          <li><Link href="/random" className="chip min-h-[38px] px-3.5">Surprise me</Link></li>
        </ul>
      </nav>

      <Faq className="pt-14" title={`Questions about ${w.title}`} items={faq} />
    </div>
  );
}
