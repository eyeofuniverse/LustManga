"use client";

import Link from "next/link";

/** The reader has no site chrome, so it brings its own way out when a chapter fails to load. */
export default function ReaderError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div data-theme="dark" className="grid min-h-dvh place-items-center bg-black px-6 text-center text-white">
      <div className="max-w-sm space-y-4">
        <p className="font-display text-5xl font-extrabold text-accent">Oops</p>
        <h1 className="font-display text-xl font-bold">This chapter did not load</h1>
        <p className="text-sm text-white/60">It is usually temporary. Try again in a moment.</p>
        <div className="flex justify-center gap-2">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-soft !bg-white/10 !text-white">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
