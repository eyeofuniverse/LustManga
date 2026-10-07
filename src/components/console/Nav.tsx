"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number };

export function Nav({ items, email }: { items: NavItem[]; email: string }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface p-3">
      <div className="mb-4 px-2 text-sm font-bold tracking-wide text-accent">LustManga Console</div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((i) => {
          const active = i.href === "/console" ? path === "/console" : path.startsWith(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${active ? "bg-surface-2 text-white" : "text-white/70 hover:bg-white/5"}`}
            >
              {i.label}
              {i.badge ? <span className="rounded-full bg-accent px-2 text-xs font-semibold text-white">{i.badge}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-2 pt-3 text-xs text-white/50">
        <div className="truncate">{email}</div>
        <button
          className="mt-1 text-white/70 underline hover:text-white"
          onClick={async () => {
            await fetch("/api/console/auth/logout", { method: "POST" });
            router.push("/console/login");
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
