import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Flame, Images, Library, Palette, Gamepad2, Globe2, Sparkles, type LucideIcon } from "lucide-react";
import { currentPrefs } from "@/lib/prefs-server";
import { categoryCounts, getWork, homeLists, popularTags } from "@/lib/queries";
import { categoryLabel, compact, langLabel, tagHref, workHref } from "@/lib/format";
import { CoverImage } from "@/components/work/CoverImage";
import { WorkCard, WorkGrid } from "@/components/work/WorkCard";
import { ScrollRow } from "@/components/work/ScrollRow";
import { SectionHeader } from "@/components/work/Section";
import { ContinueRow } from "@/components/work/ContinueRow";
import { ReadButton } from "@/components/work/Actions";
import { Faq, type QA } from "@/components/seo/Faq";
import { HOME_DESCRIPTION, HOME_TITLE, ldJson, organizationLd, socialMeta, websiteLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  ...socialMeta({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/" }),
};

const FAQ: QA[] = [
  {
    q: "Is LustManga free to read?",
    text: "Yes. Every manga and doujinshi can be read online for free, with no account and no sign-up.",
    a: "Yes. Every manga and doujinshi can be read online for free, with no account and no sign-up.",
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
    text: "Your saved works and reading history are stored in your own browser, not on our servers. There are no accounts.",
    a: "Your saved works and reading history are stored in your own browser, not on our servers. There are no accounts.",
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
  const [lists, cats, tags, artists] = await Promise.all([
    homeLists(prefs.langs, hide),
    categoryCounts(),
    popularTags("TAG", 30),
    popularTags("ARTIST", 18),
  ]);
  const spot = lists.popular[0];
  const spotFull = spot ? await getWork(spot.publicId) : null;
  const rest = lists.popular.slice(spot ? 1 : 0);

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
            Read manga &amp; doujinshi online, <span className="text-text">free in every language</span>
          </h1>
        </div>
        <div className="container-x grid items-center gap-6 pb-8 pt-4 sm:gap-8 sm:pb-12 sm:pt-6 md:grid-cols-[auto_1fr] lg:gap-14 lg:pb-16">
          {spot ? (
            <>
              <Link href={workHref(spot)} aria-label={spot.title} className="relative mx-auto block w-40 shrink-0 sm:w-52 md:mx-0 md:w-64 lg:w-72">
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] ring-1 ring-line transition duration-500 hover:-translate-y-1 hover:shadow-glow">
                  <CoverImage coverKey={spot.coverKey} priority small={false} />
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
                    <Link href={`/browse?cat=${c.category}`} className={`group relative flex h-28 flex-col justify-between overflow-hidden rounded-2xl border border-line bg-gradient-to-br p-4 transition hover:-translate-y-0.5 hover:border-accent/40 sm:h-32 ${tone}`}>
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

      {tags.length > 0 && (
        <section className="container-x pt-12 sm:pt-16" aria-label="Popular tags">
          <SectionHeader title="Popular tags" href="/tags" label="All tags" />
          <ul className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t.id}>
                <Link href={tagHref("tag", t.slug)} className="chip min-h-[38px] px-3.5">
                  {t.name}
                  <span className="text-xs font-normal text-muted">{compact(t.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {artists.length > 0 && (
        <section className="container-x pt-12 sm:pt-16" aria-label="Popular artists">
          <SectionHeader title="Popular artists" href="/artists" label="All artists" />
          <ul className="flex flex-wrap gap-2">
            {artists.map((t) => (
              <li key={t.id}>
                <Link href={tagHref("artist", t.slug)} className="chip min-h-[38px] px-3.5">
                  {t.name}
                  <span className="text-xs font-normal text-muted">{compact(t.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Faq items={FAQ} />
    </>
  );
}
