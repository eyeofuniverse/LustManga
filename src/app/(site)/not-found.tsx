import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-16">
      <div className="card max-w-md space-y-4 px-8 py-12 text-center">
        <p className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text font-display text-6xl font-extrabold text-transparent">404</p>
        <h1 className="font-display text-xl font-bold">Nothing here</h1>
        <p className="text-sm text-muted">This page does not exist, or the work was removed.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/browse" className="btn-primary">
            Browse everything
          </Link>
          <Link href="/random" prefetch={false} className="btn-soft">
            Surprise me
          </Link>
        </div>
      </div>
    </div>
  );
}
