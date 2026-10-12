import type { Metadata } from "next";
import Link from "next/link";
import { getMember } from "@/lib/member/session";
import { safeNext } from "@/lib/member/next";
import { SignInForm } from "@/components/member/AuthForms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, "");
  const me = await getMember();
  return (
    <div className="container-x mx-auto max-w-md py-10 sm:py-14">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Sign in</h1>
      <p className="mb-6 mt-1.5 text-sm text-muted">
        Sign in to rate works and join the comments. New here? <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="text-accent underline underline-offset-2">Create an account</Link>.
      </p>
      <SignInForm next={next || undefined} signedInAs={me?.displayName} />
    </div>
  );
}
