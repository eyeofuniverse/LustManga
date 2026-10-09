"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/browse", label: "Browse", match: ["/browse", "/tag", "/language", "/category"] },
  { href: "/updates", label: "Updates", match: ["/updates"] },
  { href: "/tags", label: "Tags", match: ["/tags"] },
  { href: "/artists", label: "Artists", match: ["/artists", "/artist", "/group", "/groups"] },
  { href: "/parodies", label: "Parodies", match: ["/parodies", "/parody", "/characters", "/character"] },
  { href: "/random", label: "Random", match: [] as string[] },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="ml-3 hidden items-center gap-1 lg:flex">
      {ITEMS.map((i) => {
        const active = i.match.some((m) => path === m || path.startsWith(m + "/"));
        return (
          <Link
            key={i.href}
            href={i.href}
            prefetch={i.href === "/random" ? false : undefined}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "text-text" : "text-muted hover:bg-surface-2 hover:text-text"}`}
          >
            {i.label}
            {active && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-gradient-to-r from-accent to-accent-2" />}
          </Link>
        );
      })}
    </nav>
  );
}
