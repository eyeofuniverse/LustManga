import type { Metadata } from "next";
import Link from "@/components/site/Link";
import { NotFoundTracker } from "@/components/analytics/Events";
import { Tracker } from "@/components/analytics/Tracker";
import { LogoMark } from "@/components/site/Logo";
import { analyticsEnabled } from "@/lib/analytics/config";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

/**
 * An address that matches no page at all (a broken link from another site, a typo). The page-level not-found screens inside
 * the site only run when a page asks for them, so without this one these visits would get the framework's bare 404, which has
 * no way back into the site and is invisible to the analytics, although it is the most useful 404 to know about.
 */
export default function RootNotFound() {
  return (
    <main className="container-x grid min-h-dvh place-items-center py-16">
      <Tracker enabled={analyticsEnabled()} />
      <NotFoundTracker />
      <div className="card max-w-md space-y-4 px-8 py-12 text-center">
        <Link href="/" className="mx-auto flex w-fit items-center gap-2 font-display font-extrabold" aria-label={`${SITE_NAME} home`}>
          <LogoMark className="h-8 w-8" /> {SITE_NAME}
        </Link>
        <p className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text font-display text-6xl font-extrabold text-transparent">404</p>
        <h1 className="font-display text-xl font-bold">Nothing here</h1>
        <p className="text-sm text-muted">This page does not exist, or the work was removed.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/browse" className="btn-primary">
            Browse everything
          </Link>
          <Link href="/" className="btn-soft">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
