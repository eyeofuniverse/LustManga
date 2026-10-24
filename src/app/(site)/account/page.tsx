import type { Metadata } from "next";
import Link from "@/components/site/Link";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { getMember } from "@/lib/member/session";
import { loadActivity } from "@/lib/member/community-queries";
import { workHref, timeAgo } from "@/lib/format";
import { longDate } from "@/lib/blurbs";
import { Avatar } from "@/components/member/Avatar";
import { CodesForm, DeleteForm, PasswordForm, ProfileForm, SignOutButton } from "@/components/member/AccountForms";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 mt-10 font-display text-lg font-bold">{children}</h2>;

export default async function AccountPage() {
  const me = await getMember();
  if (!me) redirect("/login?next=/account");
  const [row, activity] = await Promise.all([prisma.member.findUnique({ where: { id: me.id }, select: { recoveryHashes: true } }), loadActivity(me.id)]);

  return (
    <div className="container-x mx-auto max-w-3xl py-8 sm:py-12">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar name={me.displayName} handle={me.handle} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{me.displayName}</h1>
          <p className="text-sm text-muted">
            Member since {longDate(me.createdAt)} · <Link href={`/u/${me.handle}`} className="text-accent underline underline-offset-2">View my public profile</Link>
          </p>
        </div>
        <SignOutButton />
      </header>
      {me.banned && (
        <p role="alert" className="mt-6 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
          This account can read, but it cannot post comments or ratings.{me.bannedReason ? ` Reason: ${me.bannedReason}` : ""}
        </p>
      )}

      <H>Profile</H>
      <ProfileForm displayName={me.displayName} bio={me.bio ?? ""} email={me.email ?? ""} showRatings={me.showRatings} />

      <H>Your ratings</H>
      {activity.ratings.length ? (
        <ul className="card divide-y divide-line">
          {activity.ratings.map((r) => (
            <li key={r.work.publicId} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Link href={workHref(r.work)} className="min-w-0 flex-1 truncate font-medium hover:text-accent">{r.work.title}</Link>
              <span className="inline-flex shrink-0 items-center gap-1 text-warn" aria-label={`${r.value} out of 5 stars`}>
                <Star className="h-4 w-4 fill-current" aria-hidden="true" /> {r.value}
              </span>
              <time className="hidden shrink-0 text-xs text-muted sm:block" dateTime={r.updatedAt.toISOString()}>{timeAgo(r.updatedAt)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">You have not rated anything yet. Open a work and tap the stars.</p>
      )}

      <H>Your comments</H>
      {activity.comments.length ? (
        <ul className="card divide-y divide-line">
          {activity.comments.map((c) => (
            <li key={c.id} className="space-y-1 px-4 py-3 text-sm">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <Link href={workHref(c.work)} className="font-semibold text-text hover:text-accent">{c.work.title}</Link>
                <time dateTime={c.createdAt.toISOString()}>{timeAgo(c.createdAt)}</time>
                {c.status === "HIDDEN" && <span className="rounded bg-warn/20 px-1.5 py-0.5 font-semibold text-warn">hidden pending review</span>}
              </p>
              <p className="line-clamp-3 whitespace-pre-line text-text/90">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">You have not commented yet.</p>
      )}

      <H>Password</H>
      <PasswordForm />

      <H>Recovery codes</H>
      <CodesForm username={me.displayName} left={row?.recoveryHashes.length ?? 0} />

      <H>Delete account</H>
      <DeleteForm />
    </div>
  );
}
