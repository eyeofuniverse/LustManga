"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withQuery } from "@/lib/url";

/** "Go to page N" for long lists: the numbered links only reach a few pages around the current one. */
export function PageJump({ base, params, totalPages, page }: { base: string; params: Record<string, string | undefined>; totalPages: number; page: number }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Math.min(totalPages, Math.max(1, Number.parseInt(value, 10) || 0));
    if (!n || n === page) return;
    router.push(withQuery(base, params, { page: n <= 1 ? undefined : n }));
    setValue("");
  };
  return (
    <form onSubmit={go} className="flex items-center gap-2" aria-label="Go to page">
      <label htmlFor="page-jump" className="sr-only">
        Go to page (1 to {totalPages})
      </label>
      <input
        id="page-jump"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        placeholder={`1-${totalPages}`}
        className="h-11 w-20 rounded-xl border border-line bg-surface-2/70 px-3 text-center text-sm focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      <button type="submit" className="btn-soft h-11 !min-h-0 px-4 text-sm">
        Go
      </button>
    </form>
  );
}
