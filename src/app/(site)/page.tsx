import type { Metadata } from "next";
import Link from "@/components/site/Link";
import { BookMarked, BookOpen, Compass, Flame, Images, Library, Palette, Gamepad2, Globe2, Sparkles, type LucideIcon } from "lucide-react";
import { currentPrefs } from "@/lib/prefs-server";
import { categoryCounts, getWork, homeLists, popularTags, siteStats } from "@/lib/queries";
import { categoryHref, categoryLabel, compact, langLabel, tagHref, timeAgo, workHref } from "@/lib/format";
import { libraryParagraph } from "@/lib/blurbs";
import { ChipSection } from "@/components/work/ChipSection";
import { CoverImage } from "@/components/work/CoverImage";
import { WorkCard, WorkGrid } from "@/components/work/WorkCard";
import { ScrollRow } from "@/components/work/ScrollRow";
import { SectionHeader } from "@/components/work/Section";
import { ContinueRow } from "@/components/work/ContinueRow";
import { ReadButton } from "@/components/work/Actions";
import { Faq, type QA } from "@/components/seo/Faq";
import { AdSlot } from "@/components/ads/AdSlot";
import { HOME_DESCRIPTION, HOME_TITLE, ldJson, organizationLd, socialMeta, websiteLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  ...socialMeta({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/" }),
};

/** Questions whose answers come from the library itself. */
function libraryFaq(about: string | null): QA[] {
  if (!about) return [];
  return [
    { q: "How big is the library?", text: about, a: about },
    {
      q: "How do new works and chapters show up?",
      text: "New uploads lists the newest works, and Latest updates lists the series that just got a new chapter. Popular, Trending and Top rated follow what readers are reading and rating.",
      a: (
        <>
          <Link href="/browse?sort=new" className="text-accent underline underline-offset-2">New uploads</Link> lists the newest works, and <Link href="/updates" className="text-accent underline underline-offset-2">Latest updates</Link> lists the series that just got a new chapter. Popular, <Link href="/browse?sort=trending" className="text-accent underline underline-offset-2">Trending</Link> and <Link href="/browse?sort=rated" className="text-accent underline underline-offset-2">Top rated</Link> follow what readers are reading and rating.
        </>
      ),
    },
  ];
}

const FAQ: QA[] = [
  {
    q: "Is LustPages free to read?",
    text: "Yes. Every hentai manga and doujinshi can be read online for free.",
    a: "Yes. Every hentai manga and doujinshi can be read online for free.",
  },
  {
    q: "Which languages can I read in?",
    text: "Works are available in many languages, including English, Japanese, Chinese, Spanish, French, Russian and more. Pick the languages you read once in Settings and every list follows them.",
    a: (
      <>
        Works are available in many languages, including English, Japanese, Chinese, Spanish, French, Russian and more. Pick the languages you read once in <Link href="/settings" className="text-accent underline underline-offset-2">Settings</Link> and every list follows them.
      </>
    ),
  },
  {
    q: "How do I find something specific?",
    text: "Use the search box, or browse by tag, artist, circle, parody and character. Advanced search lets you include and exclude tags and filter by page count and upload date.",
    a: (
      <>
        Use the search box, or browse by <Link href="/tags" className="text-accent underline underline-offset-2">tag</Link>, <Link href="/artists" className="text-accent underline underline-offset-2">artist</Link>, <Link href="/groups" className="text-accent underline underline-offset-2">circle</Link>, <Link href="/parodies" className="text-accent underline underline-offset-2">parody</Link> and <Link href="/characters" className="text-accent underline underline-offset-2">character</Link>. <Link href="/search/help" className="text-accent underline underline-offset-2">Advanced search</Link> lets you include and exclude tags and filter by page count and upload date.
      </>
    ),
  },
  {
    q: "How does the reader work?",
    text: "It reads like a book: swipe, tap the page edges or use the arrow keys to turn pages, with two-page spreads on wide screens, right-to-left mode for manga, zoom, and a scroll mode for long strips. It remembers where you stopped.",
    a: "It reads like a book: swipe, tap the page edges or use the arrow keys to turn pages, with two-page spreads on wide screens, right-to-left mode for manga, zoom, and a scroll mode for long strips. It remembers where you stopped.",
  },
  {
    q: "Where is my reading history kept?",
    text: "Your saved works and reading history are stored in your own browser, not on our servers. Sign in only if you want to rate works and comment.",
    a: "Your saved works and reading history are stored in your own browser, not on our servers. Sign in only if you want to rate works and comment.",
  },
  {
    q: "How do I report a problem or request a removal?",
    text: "Use the report form for broken pages, copyright takedown requests, or anything that should not be here. We act first on takedown requests and on anything involving possible minors or non-consent.",
    a: (
      <>
        Use the <Link href="/report-content" className="text-accent underline underline-offset-2">report form</Link> for broken pages, copyright takedown requests, or anything that should not be here. We act first on takedown requests and on anything involving possible minors or non-consent. See also the <Link href="/dmca" className="text-accent underline underline-offset-2">DMCA page</Link>.
      </>
    ),
  },
];

const CAT: Record<string, { Icon: LucideIcon; tone: string }> = {
  DOUJINSHI: { Icon: Library, tone: "from-rose-500/25 to-orange-500/10" },
  MANGA: { Icon: BookOpen, tone: "from-violet-500/25 to-sky-500/10" },
  ARTIST_CG: { Icon: Palette, tone: "from-fuchsia-500/25 to-pink-500/10" },
  GAME_CG: { Icon: Gamepad2, tone: "from-emerald-500/25 to-teal-500/10" },
  WESTERN: { Icon: Globe2, tone: "from-amber-500/25 to-red-500/10" },
  IMAGE_SET: { Icon: Images, tone: "from-sky-500/25 to-indigo-500/10" },
};

export default async function Home() {
  const prefs = await currentPrefs();
  const hide = prefs.hide.map((h) => h.id);
  const [lists, cats, tags, artists, parodies, languages, stats] = await Promise.all([
    homeLists(prefs.langs, hide),
    categoryCounts(),
    popularTags("TAG", 30),
    popularTags("ARTIST", 18),
    popularTags("PARODY", 18),
    popularTags("LANGUAGE", 16),
    siteStats().catch(() => null), // the facts are a bonus: the page must not fail without them
  ]);
  const spot = lists.popular[0];
  const spotFull = spot ? await getWork(spot.publicId) : null;
  const rest = lists.popular.slice(spot ? 1 : 0);
  const about = stats ? libraryParagraph(stats) : null;
  // each row shows works the rows above it did not, so the page never repeats itself (a quiet chart falls back to popularity)
  const shown = new Set(lists.popular.map((w) => w.publicId));
  const fresh = (ws: typeof lists.popular, take: number) => {
    const out = ws.filter((w) => !shown.has(w.publicId)).slice(0, take);
    out.forEach((w) => shown.add(w.publicId));
    return out;
  };
  const trending = fresh(lists.trending, 12);
  const rated = fresh(lists.rated, 12);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson([organizationLd(), websiteLd()]) }} />
      {/* ───────── spotlight ───────── */}
      <section className="relative isolate overflow-hidden border-b border-line">
        {spot && (
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
            <div className="absolute inset-0 scale-125 opacity-40 blur-3xl [&>div]:absolute [&>div]:inset-0">
              <div className="relative h-full w-full">
                <CoverImage coverKey={spot.coverKey} small={false} />
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg" />
            <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/50 to-transparent" />
          </div>
        )}
        <div className="container-x pt-6 sm:pt-8">
          <h1 className="font-display text-base font-extrabold tracking-tight text-muted sm:text-lg">
            Read hentai manga &amp; doujinshi online, <span className="text-text">free in every language</span>
          </h1>
        </div>
        <div className="container-x grid items-center gap-6 pb-8 pt-4 sm:gap-8 sm:pb-12 sm:pt-6 md:grid-cols-[auto_1fr] lg:gap-14 lg:pb-16">
          {spot ? (
            <>
              <Link href={workHref(spot)} className="relative mx-auto block w-40 shrink-0 sm:w-52 md:mx-0 md:w-64 lg:w-72">
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] ring-1 ring-line transition duration-500 hover:-translate-y-1 hover:shadow-glow">
                  {/* the alt text is this link's anchor text: without it a crawler reads the (long) address instead */}
                  <CoverImage coverKey={spot.coverKey} priority small={false} alt={`Read ${spot.title}`} />
                </div>
              </Link>
              <div className="min-w-0 text-center md:text-left">
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
                  <Flame className="h-3.5 w-3.5" /> Popular right now
                </p>
                <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  <Link href={workHref(spot)} className="line-clamp-3 hover:text-accent">
                    {spot.title}
                  </Link>
                </h2>
                <p className="mt-3 text-sm text-muted sm:text-base">
                  {categoryLabel(spot.category)} · {langLabel(spot.language)} · {spot.pageCount} pages
                </p>
                {spotFull && (
                  <ul className="mt-4 hidden flex-wrap gap-2 md:flex" aria-label="Tags">
                    {spotFull.tags
                      .filter((t) => t.type === "TAG")
                      .slice(0, 7)
                      .map((t) => (
                        <li key={t.id}>
                          <Link href={tagHref("tag", t.slug)} className="chip">
                            {t.name}
                          </Link>
                        </li>
                      ))}
                  </ul>
                )}
                <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
                  <ReadButton publicId={spot.publicId} chapters={spotFull?.chapters.map((c) => c.number) ?? [1]} className="px-8" />
                  <Link href={workHref(spot)} className="btn-soft h-12 px-6">
                    Details
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-full mx-auto max-w-xl py-10 text-center">
              <Sparkles className="mx-auto mb-4 h-10 w-10 text-accent" />
              <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Welcome</h2>
              <p className="mt-3 text-muted">Nothing matches your language and hidden-tag settings yet. Try widening them.</p>
              <Link href="/settings" className="btn-primary mt-6">
                Open settings
              </Link>
            </div>
          )}
        </div>
      </section>

      <AdSlot slot="home-top" contained className="pt-8" />

      {stats && stats.works > 0 && (
        <section className="container-x pt-8 sm:pt-10" aria-label="About LustPages">
          <div className="card p-5 sm:p-7">
            <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">A free hentai manga &amp; doujinshi library</h2>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">{about}</p>
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Works", stats.works],
                ["Chapters", stats.chapters],
                ["Pages", stats.pages],
                ["Languages", stats.languages],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col-reverse rounded-xl bg-surface-2/60 px-4 py-3 ring-1 ring-line">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{k}</dt>
                  <dd className="font-display text-xl font-extrabold tabular-nums sm:text-2xl">{Number(v).toLocaleString("en-US")}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      <ContinueRow />

      {rest.length > 0 && (
        <section className="container-x pt-10 sm:pt-12" aria-label="Popular">
          <SectionHeader title="Popular now" href="/browse" sub="What everyone is reading" />
          <ScrollRow label="Popular works">
            {rest.map((w, i) => (
              <li key={w.publicId}>
                <WorkCard work={w} index={i} priority={i < 3} />
              </li>
            ))}
          </ScrollRow>
        </section>
      )}

      {trending.length > 0 && (
        <section className="container-x pt-10 sm:pt-12" aria-label="Trending">
          <SectionHeader title="Trending now" href="/browse?sort=trending" sub="Climbing the charts right now" />
          <ScrollRow label="Trending works">
            {trending.map((w, i) => (
              <li key={w.publicId}>
                <WorkCard work={w} index={i} />
              </li>
            ))}
          </ScrollRow>
        </section>
      )}

      {lists.updates.length > 0 && (
        <section className="container-x pt-10 sm:pt-12" aria-label="Latest chapter updates">
          <SectionHeader title="Latest chapter updates" href="/updates" label="All updates" sub="Series with a new chapter" />
          <ScrollRow label="Series with new chapters">
            {lists.updates.map((w, i) => (
              <li key={w.publicId}>
                <WorkCard work={w} index={i} note={`Chapter ${w.chapterNumber} · ${timeAgo(w.chapterAt)}`} />
              </li>
            ))}
          </ScrollRow>
        </section>
      )}

      {lists.fresh.length > 0 && (
        <section className="container-x pt-10 sm:pt-12" aria-label="New uploads">
          <SectionHeader title="New uploads" href="/browse?sort=new" sub="Just added" />
          <WorkGrid works={lists.fresh} priorityCount={0} />
          <div className="mt-8 text-center">
            <Link href="/browse?sort=new" className="btn-soft px-8">
              See all new uploads
            </Link>
          </div>
        </section>
      )}

      <AdSlot slot="home-mid" contained className="pt-10 sm:pt-12" />

      {rated.length > 0 && (
        <section className="container-x pt-10 sm:pt-12" aria-label="Top rated">
          <SectionHeader title="Top rated" href="/browse?sort=rated" sub="Best rated by readers" />
          <ScrollRow label="Top rated works">
            {rated.map((w, i) => (
              <li key={w.publicId}>
                <WorkCard work={w} index={i} />
              </li>
            ))}
          </ScrollRow>
        </section>
      )}

      {cats.length > 0 && (
        <section className="container-x pt-12 sm:pt-16" aria-label="Categories">
          <SectionHeader title="Browse by category" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cats
              .filter((c) => CAT[c.category])
              .map((c) => {
                const { Icon, tone } = CAT[c.category];
                return (
                  <li key={c.category}>
                    <Link href={categoryHref(c.category)} className={`group relative flex h-28 flex-col justify-between overflow-hidden rounded-2xl border border-line bg-gradient-to-br p-4 transition hover:-translate-y-0.5 hover:border-accent/40 sm:h-32 ${tone}`}>
                      <Icon className="h-6 w-6 text-text/80 transition group-hover:scale-110 group-hover:text-accent" />
                      <span>
                        <span className="block font-display text-[15px] font-bold leading-tight">{categoryLabel(c.category)}</span>
                        <span className="text-xs text-muted">{compact(c.n)} works</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <div className="container-x">
        <ChipSection title="Read in your language" type="language" items={languages} href="/browse?lang=all" label="All languages" sub="Every language has its own page" />
        <ChipSection title="Popular tags" type="tag" items={tags} href="/tags" label="All tags" />
        <ChipSection title="Popular artists" type="artist" items={artists} href="/artists" label="All artists" />
        <ChipSection title="Popular parodies" type="parody" items={parodies} href="/parodies" label="All parodies" sub="Works based on a series, game or franchise" />
      </div>

      <section className="container-x pt-12 sm:pt-16" aria-label="How LustPages works">
        <SectionHeader title="How LustPages works" />
        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            { Icon: Compass, h: "Find it fast", t: "Search by title, tag, artist, circle, parody or character. Include and exclude tags, and filter by language, category, page count and upload date." },
            { Icon: BookOpen, h: "Read it your way", t: "Page-by-page like a book, with two-page spreads on wide screens, right-to-left for manga, zoom, or a continuous scroll for long strips. It remembers where you stopped." },
            { Icon: BookMarked, h: "Join in", t: "Save works, follow tags and artists, and pick up where you left off: it all stays in your own browser. Sign in to rate works and join the comments." },
          ].map(({ Icon, h, t }) => (
            <li key={h} className="card p-5">
              <Icon className="h-6 w-6 text-accent" aria-hidden="true" />
              <h3 className="mt-3 font-display text-base font-bold">{h}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t}</p>
            </li>
          ))}
        </ul>
      </section>

      <AdSlot slot="home-footer" contained className="pt-12 sm:pt-16" />

      <Faq items={[...libraryFaq(about), ...FAQ]} />
    </>
  );
}
