import Link from "next/link";
import { BookOpen, Flame, Images, Library, Palette, Gamepad2, Globe2, Sparkles, type LucideIcon } from "lucide-react";
import { currentPrefs } from "@/lib/prefs-server";
import { categoryCounts, getWork, homeLists, popularTags } from "@/lib/queries";
import { categoryLabel, compact, langLabel, readHref, tagHref, workHref } from "@/lib/format";
import { CoverImage } from "@/components/work/CoverImage";
import { WorkCard, WorkGrid } from "@/components/work/WorkCard";
import { ScrollRow } from "@/components/work/ScrollRow";
import { SectionHeader } from "@/components/work/Section";
import { ContinueRow } from "@/components/work/ContinueRow";

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
        <div className="container-x grid items-center gap-6 py-8 sm:gap-8 sm:py-12 md:grid-cols-[auto_1fr] lg:gap-14 lg:py-16">
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
                <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  <Link href={workHref(spot)} className="line-clamp-3 hover:text-accent">
                    {spot.title}
                  </Link>
                </h1>
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
                  <Link href={readHref(spot.publicId, 1)} className="btn-primary h-12 px-8">
                    <BookOpen className="h-5 w-5" /> Start reading
                  </Link>
                  <Link href={workHref(spot)} className="btn-soft h-12 px-6">
                    Details
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-full mx-auto max-w-xl py-10 text-center">
              <Sparkles className="mx-auto mb-4 h-10 w-10 text-accent" />
              <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Welcome</h1>
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
    </>
  );
}
