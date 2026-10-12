import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare, Star } from "lucide-react";
import { loadProfile } from "@/lib/member/community-queries";
import { getMember } from "@/lib/member/session";
import { workHref, timeAgo } from "@/lib/format";
import { longDate, plural } from "@/lib/blurbs";
import { Avatar } from "@/components/member/Avatar";
import { CoverImage } from "@/components/work/CoverImage";

type Params = Promise<{ handle: string }>;
const valid = (h: string) => /^[a-z][a-z0-9_]{2,19}$/i.test(h);

// profiles are people, not pages worth finding through a search engine
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle } = await params;
  return { title: valid(handle) ? `${handle} - member profile` : "Not found", robots: { index: false, follow: false } };
}

export default async function ProfilePage({ params }: { params: Params }) {
  const { handle } = await params;
  if (!valid(handle)) notFound();
  const p = await loadProfile(handle);
  if (!p) notFound();
  const me = await getMember();

  return (
    <div className="container-x mx-auto max-w-3xl py-8 sm:py-12">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar name={p.displayName} handle={p.handle} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{p.displayName}</h1>
          <p className="text-sm text-muted">
            Member since {longDate(p.joined)} · {plural(p.commentCount, "comment")}
            {p.showRatings ? ` · ${plural(p.ratingCount, "rating")}` : ""}
          </p>
        </div>
        {me?.handle === p.handle && (
          <Link href="/account" className="btn-soft h-11 px-5">
            Edit profile
          </Link>
        )}
      </header>
      {p.bio && <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-text/90">{p.bio}</p>}
      {p.banned && <p className="mt-5 rounded-xl border border-line px-4 py-3 text-sm text-muted">This account has been suspended.</p>}

      {p.showRatings && p.ratings.length > 0 && (
        <section className="mt-10" aria-label="Ratings">
          <h2 className="mb-3 font-display text-lg font-bold">Ratings</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {p.ratings.map((r) => (
              <li key={r.work.publicId}>
                <Link href={workHref(r.work)} className="group block">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line">
                    <CoverImage coverKey={r.work.coverKey} alt="" />
                    <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-bold text-warn">
                      <Star className="h-3 w-3 fill-current" aria-hidden="true" /> {r.value}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs font-medium group-hover:text-accent">{r.work.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-label="Comments">
        <h2 className="mb-3 font-display text-lg font-bold">Recent comments</h2>
        {p.comments.length ? (
          <ul className="card divide-y divide-line">
            {p.comments.map((c) => (
              <li key={c.id} className="space-y-1 px-4 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  <Link href={workHref(c.work)} className="font-semibold text-text hover:text-accent">{c.work.title}</Link>
                  <time dateTime={c.createdAt.toISOString()}>{timeAgo(c.createdAt)}</time>
                </p>
                <p className="line-clamp-4 whitespace-pre-line text-text/90">{c.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No comments yet.</p>
        )}
      </section>
    </div>
  );
}
