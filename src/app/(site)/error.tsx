"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-16">
      <div className="card max-w-md space-y-4 px-8 py-12 text-center">
        <p className="font-display text-5xl font-extrabold text-accent">Oops</p>
        <h1 className="font-display text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-muted">That page failed to load. It is usually temporary: try again in a moment.</p>
        <div className="flex justify-center gap-2">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-soft">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
