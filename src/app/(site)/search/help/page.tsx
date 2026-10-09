import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/work/Section";
import { staticMeta } from "@/lib/seo";

export const metadata: Metadata = staticMeta({ title: "Search Help: Advanced Hentai Manga & Doujinshi Search", description: "How to search LustPages like a pro: include and exclude tags, filter by artist, parody, language, page count and upload date, with examples.", path: "/search/help" });

const ROWS: [string, string][] = [
  ["school life", "Words are matched against titles"],
  ['"exact phrase"', "Quotes keep words together"],
  ['tag:"big breasts"', "Works with that tag"],
  ["-tag:netorare", "Without that tag (a dash excludes anything)"],
  ["artist:name  group:name", "By artist or circle"],
  ["parody:\"series name\"  character:name", "By source series or character"],
  ["language:english  category:doujinshi", "By language or category"],
  ["pages:>20   pages:<=40   pages:12", "Page count: > < >= <= ="],
  ["uploaded:<7d", "Added within the last 7 days (d, w, m, y)"],
  ["uploaded:>1y", "Added more than a year ago"],
  ["-word", "Leave out titles containing a word"],
];

export default function Help() {
  return (
    <div className="container-x max-w-3xl py-6 sm:py-10">
      <PageHeading title="Search help" sub="Combine anything below in one search box" />
      <div className="card divide-y divide-line overflow-hidden">
        {ROWS.map(([q, what]) => (
          <div key={q} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-6">
            <Link href={`/search?q=${encodeURIComponent(q.split("   ")[0].split("  ")[0])}`} className="break-words font-mono text-sm text-accent hover:underline">
              {q}
            </Link>
            <p className="text-sm text-muted">{what}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        Example: <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text">school tag:"big breasts" -tag:netorare language:english pages:&gt;20</code>
      </p>
    </div>
  );
}
