import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPrefs } from "@/lib/prefs-server";
import { listUpdates, prefFilters } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";
import { flatParams, withQuery } from "@/lib/url";
import { timeAgo } from "@/lib/format";
import { breadcrumbLd, ldJson, listingMetadata } from "@/lib/seo";
import { EmptyState, WorkCard } from "@/components/work/WorkCard";
import { Pagination } from "@/components/work/Pagination";
import { PageHeading } from "@/components/work/Section";

export const generateMetadata = ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> =>
  listingMetadata({
    title: "Latest Manga Updates: New Chapters",
    description: "The manga series that just got a new chapter on LustManga, newest first. Read the latest chapters online free.",
    base: "/updates",
    searchParams,
  });

export default async function UpdatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = flatParams(await searchParams);
  const prefs = await currentPrefs();
  const f = parseFilters(sp, prefs);
  const { items, hasNext } = await listUpdates({ langs: f.langs.length ? f.langs : undefined, exclude: prefFilters(prefs).exclude, page: f.page, pageSize: 24 });
  if (!items.length && f.page > 1) redirect(withQuery("/updates", sp, { page: undefined }));

  return (
    <div className="container-x py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbLd([{ name: "Home", path: "/" }, { name: "Latest updates", path: "/updates" }])) }} />
      <PageHeading title="Latest updates" sub="Series with a new chapter, newest first" eyebrow="Manga" />
      {items.length ? (
        <>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((w, i) => (
              <li key={w.publicId}>
                <WorkCard work={w} index={i} priority={i < 6} note={`Chapter ${w.chapterNumber} · ${timeAgo(w.chapterAt)}`} />
              </li>
            ))}
          </ul>
          <Pagination base="/updates" params={sp} page={f.page} hasNext={hasNext} />
        </>
      ) : (
        <EmptyState title="No updates match your languages" hint="Series with new chapters appear here. Try showing every language.">
          <Link href="/updates?lang=all" className="btn-primary mt-2">
            Show every language
          </Link>
        </EmptyState>
      )}
    </div>
  );
}
