"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, LayoutGrid, Search, SlidersHorizontal } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Home", Icon: Home, match: (p: string) => p === "/" },
  { href: "/browse", label: "Browse", Icon: LayoutGrid, match: (p: string) => ["/browse", "/tag", "/tags", "/artist", "/artists", "/group", "/parody", "/parodies", "/character", "/characters", "/language", "/category"].some((m) => p === m || p.startsWith(m + "/")) },
  { href: "/search", label: "Search", Icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/favorites", label: "Saved", Icon: Heart, match: (p: string) => p.startsWith("/favorites") || p.startsWith("/history") },
  { href: "/settings", label: "Settings", Icon: SlidersHorizontal, match: (p: string) => p.startsWith("/settings") },
];

/** App-style tab bar for phones and small tablets. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 md:hidden">
      <ul className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
        {ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(path);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`tap-none relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-90 ${active ? "text-accent" : "text-muted"}`}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gradient-to-r from-accent to-accent-2" />}
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
