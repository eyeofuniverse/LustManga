import type { Metadata } from "next";
import Link from "next/link";
import { getMember } from "@/lib/member/session";
import { safeNext } from "@/lib/member/next";
import { SignUpForm } from "@/components/member/AuthForms";

export const metadata: Metadata = { title: "Create an account", robots: { index: false, follow: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, "");
  const me = await getMember();
  return (
    <div className="container-x mx-auto max-w-md py-10 sm:py-14">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Create an account</h1>
      <p className="mb-6 mt-1.5 text-sm text-muted">
        An account lets you rate works, comment, and have a profile. Already have one? <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="text-accent underline underline-offset-2">Sign in</Link>.
      </p>
      <SignUpForm next={next || undefined} signedInAs={me?.displayName} />
    </div>
  );
}
