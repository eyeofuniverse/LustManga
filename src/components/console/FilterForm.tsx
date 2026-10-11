"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A filter bar that navigates inside the app. A plain `<form action>` makes the browser reload the whole document (scripts,
 * layout, the lot) on every search; this builds the same URL and hands it to the router, so only the list below changes,
 * with the page's loading skeleton showing at once. A dropdown applies the moment it changes. Empty fields are left out of
 * the URL, and the page number is dropped (a new filter starts on page 1).
 */
export function FilterForm({ action, className = "", children }: { action: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      action={action}
      method="get"
      className={`${className} transition-opacity ${pending ? "opacity-70" : ""}`}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const p = new URLSearchParams();
        for (const [k, v] of new FormData(e.currentTarget).entries()) if (typeof v === "string" && v.trim()) p.set(k, v.trim());
        const qs = p.toString();
        const target = qs ? `${action}?${qs}` : action;
        if (target === location.pathname + location.search) {
          // the same filter again: nothing to navigate to, so just re-read the list (and leave the progress bar alone)
          start(() => router.refresh());
          return;
        }
        window.dispatchEvent(new Event("lm:nav-start")); // the top progress bar, which otherwise only reacts to link clicks
        start(() => router.push(target));
      }}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    >
      {children}
      {pending && <span role="status" className="sr-only">Filtering…</span>}
    </form>
  );
}
