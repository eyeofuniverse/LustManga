"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, Copy, ExternalLink, Flag, LayoutDashboard, Library, LogOut, Menu, Moon, ScrollText, Search, ShieldAlert, Sun, Tags, X, type LucideIcon,
} from "lucide-react";
import { initials } from "@/lib/admin/format";
import { CommandPalette } from "./CommandPalette";

export type NavIcon = "dashboard" | "review" | "reports" | "duplicates" | "works" | "tags" | "runs" | "audit";
export type NavItem = { href: string; label: string; icon: NavIcon; group: string; badge?: number };

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  review: ShieldAlert,
  reports: Flag,
  duplicates: Copy,
  works: Library,
  tags: Tags,
  runs: Activity,
  audit: ScrollText,
};

const isActive = (href: string, path: string) => (href === "/console" ? path === "/console" : path === href || path.startsWith(href + "/"));

function Brand() {
  return (
    <Link href="/console" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-glow" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4v13a3 3 0 0 0 3 3h9" />
          <path d="M10 8h7M10 12h4" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block font-display text-[15px] font-extrabold tracking-tight">
          Lust<span className="text-accent">Pages</span>
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Console</span>
      </span>
    </Link>
  );
}

function NavList({ items, path, onNavigate }: { items: NavItem[]; path: string; onNavigate?: () => void }) {
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav aria-label="Console" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{g}</p>
          <ul className="space-y-0.5">
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const Icon = ICONS[i.icon];
                const current = isActive(i.href, path);
                return (
                  <li key={i.href}>
                    <Link href={i.href} onClick={onNavigate} className="c-nav-link" aria-current={current ? "page" : undefined}>
                      <Icon className={`h-[17px] w-[17px] shrink-0 ${current ? "text-accent" : ""}`} aria-hidden="true" />
                      <span className="flex-1 truncate">{i.label}</span>
                      {i.badge ? (
                        <span className="grid min-w-[22px] place-items-center rounded-full bg-accent-fill px-1.5 text-[11px] font-bold leading-[18px] text-white tabular-nums" aria-label={`${i.badge} waiting`}>
                          {i.badge > 999 ? "999+" : i.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Shell({ items, email, role, children }: { items: NavItem[]; email: string; role: string; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const menuBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const current = items.find((i) => isActive(i.href, path));

  /* theme: the layout's inline script already applied the saved choice, so just mirror it */
  useEffect(() => {
    const root = document.getElementById("console-root");
    if (root?.dataset.theme === "light") setTheme("light");
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.getElementById("console-root")?.setAttribute("data-theme", next);
    try {
      localStorage.setItem("lm-console-theme", next);
    } catch {
      /* private mode: the choice just lasts for this visit */
    }
  };

  /* the drawer: closes on navigation, Escape or the backdrop; locks page scroll; hands focus back to its button */
  const closeDrawer = useCallback(() => {
    setDrawer(false);
    menuBtn.current?.focus();
  }, []);
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (!drawer) return;
    closeBtn.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawer, closeDrawer]);

  /* Ctrl/Cmd+K opens the palette from anywhere (and "/" when not typing) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? "") || (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") (e.preventDefault(), setPalette((p) => !p));
      else if (e.key === "/" && !typing) (e.preventDefault(), setPalette(true));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const signOut = async () => {
    await fetch("/api/console/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/console/login");
  };

  const User = (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 p-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-xs font-extrabold text-white" aria-hidden="true">
          {initials(email)}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold" title={email}>{email}</span>
          <span className="block text-[11px] capitalize text-muted">{role.toLowerCase()}</span>
        </span>
        <button type="button" onClick={signOut} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-bad/10 hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70" aria-label="Sign out" title="Sign out">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  const ThemeBtn = (
    <button type="button" onClick={flip} className="c-btn-ghost !px-2.5" aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"} title="Theme">
      {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <a href="#console-main" className="skip-link">Skip to content</a>

      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pb-3 pt-5"><Brand /></div>
        <NavList items={items} path={path} />
        {User}
      </aside>

      <div className="min-w-0">
        {/* top bar: search and theme on desktop; menu, title and search on a phone */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-xl sm:px-4 lg:h-16 lg:px-8">
          <button ref={menuBtn} type="button" onClick={() => setDrawer(true)} className="c-btn-ghost !px-2.5 lg:hidden" aria-label="Open the menu" aria-expanded={drawer}>
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <p className="min-w-0 flex-1 truncate font-display text-[15px] font-bold lg:hidden">{current?.label ?? "Console"}</p>

          <button
            type="button"
            onClick={() => setPalette(true)}
            className="hidden h-10 w-full max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-3.5 text-left text-[13px] text-muted transition hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 lg:flex"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="flex-1 truncate">Search works, tags, or jump to a page…</span>
            <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] font-semibold">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setPalette(true)} className="c-btn-ghost !px-2.5 lg:hidden" aria-label="Search">
              <Search className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
            {ThemeBtn}
            <a href="/" target="_blank" rel="noopener" className="c-btn-ghost hidden sm:inline-flex">
              View site <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </header>

        <main id="console-main" tabIndex={-1} className="mx-auto w-full max-w-[1320px] px-4 py-6 pb-24 outline-none sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>

      {/* phone / tablet drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close the menu" tabIndex={-1} className="c-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="absolute inset-y-0 left-0 flex w-[min(86vw,20rem)] flex-col bg-surface shadow-card" style={{ animation: "drawer .22s cubic-bezier(.2,.8,.3,1) both" }}>
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <Brand />
              <button ref={closeBtn} type="button" onClick={closeDrawer} className="c-btn-ghost !px-2.5" aria-label="Close the menu">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <NavList items={items} path={path} onNavigate={() => setDrawer(false)} />
            {User}
          </div>
        </div>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} items={items} />
    </div>
  );
}
