"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useCallback, useEffect } from "react";
import { allow, enqueue, flush, newId, optedOut, Stopwatch } from "@/lib/analytics/client";
import { isUntracked } from "@/lib/analytics/paths";

type Vital = { m: string; v: number; r: string };
const WANTED = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);

/**
 * What belongs to the browser tab, not to a component. The site and the reader have different layouts, so going from a work
 * page into the reader mounts a NEW <Tracker>; if this lived in the component, the new one would think the visit had just
 * begun (and send the original referrer a second time), and the page being left would never report how long it was open.
 */
const tab = {
  current: null as { id: string; path: string; at: number } | null,
  clock: null as Stopwatch | null,
  /** the first page of this document has been reported (only that one carries the referrer and campaign) */
  landed: false,
  /** the first page, which is the one the speed numbers describe */
  landing: null as string | null,
  vitals: new Map<string, Vital>(),
  sentVitals: new Set<string>(),
};

/**
 * Page views, time on page and real-user speed numbers for the public site. It renders nothing. `enabled` comes from the
 * server (off on previews, local builds and for the console), and the visitor's own "do not track" choice is honoured here
 * as well as on the server.
 *
 * What counts as a page view: the path changing. Changing a filter, a sort or the page number inside a list keeps the same
 * path and is not a new view.
 */
export function Tracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();

  // stable, so it is registered once and not again on every navigation
  const onVital = useCallback((m: { name: string; value: number; rating?: string }) => {
    if (!WANTED.has(m.name) || tab.sentVitals.has(m.name)) return;
    tab.vitals.set(m.name, { m: m.name, v: m.value, r: m.rating ?? "good" });
  }, []);
  useReportWebVitals(onVital);

  useEffect(() => {
    allow(enabled);
  }, [enabled]);

  // one page view per path change
  useEffect(() => {
    if (!enabled || optedOut() || isUntracked(pathname ?? "")) return;
    const path = pathname ?? "/";
    const prev = tab.current;
    if (prev && prev.path === path && Date.now() - prev.at < 1000) return; // React re-running the effect, not a navigation

    // close the page we are leaving: how long it was really in use
    if (prev) {
      const sec = tab.clock?.read() ?? 0;
      if (sec >= 1) enqueue({ t: "leave", id: prev.id, sec });
      tab.current = null;
    }
    tab.clock = new Stopwatch(); // a fresh clock for the new page

    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      const id = newId();
      tab.current = { id, path, at: Date.now() };
      const view: Record<string, unknown> = {
        t: "view",
        id,
        path,
        gate: document.getElementById("site-content")?.getAttribute("data-gated") === "true",
        tc: navigator.maxTouchPoints > 1,
      };
      if (!tab.landed) {
        // how the visitor arrived is only known on the first page of a visit
        const sp = new URLSearchParams(location.search);
        if (document.referrer) view.ref = document.referrer;
        for (const [k, p] of [["us", "utm_source"], ["um", "utm_medium"], ["uc", "utm_campaign"]] as const) {
          const v = sp.get(p);
          if (v) view[k] = v.slice(0, 60);
        }
        tab.landed = true;
        tab.landing = path;
      }
      enqueue(view, true);
    };

    // a tab opened in the background, or a page being prerendered, is not viewed yet
    const waitVisible = () => {
      if ((document as Document & { prerendering?: boolean }).prerendering) document.addEventListener("prerenderingchange", waitVisible, { once: true });
      else if (document.visibilityState !== "visible") {
        const on = () => {
          if (document.visibilityState === "visible") {
            document.removeEventListener("visibilitychange", on);
            tab.clock?.show();
            start();
          }
        };
        document.addEventListener("visibilitychange", on);
      } else start();
    };
    waitVisible();
    return () => {
      cancelled = true;
    };
  }, [pathname, enabled]);

  // the clock, and what to send when the page goes away
  useEffect(() => {
    if (!enabled) return;
    const poke = () => tab.clock?.poke();
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, poke, { passive: true, capture: true });

    const report = () => {
      const c = tab.current;
      const sec = tab.clock?.read() ?? 0;
      if (c && sec >= 1) enqueue({ t: "leave", id: c.id, sec });
      const items = [...tab.vitals.values()].filter((v) => !tab.sentVitals.has(v.m));
      if (items.length && tab.landing) {
        for (const v of items) tab.sentVitals.add(v.m);
        enqueue({ t: "vit", path: tab.landing, tc: navigator.maxTouchPoints > 1, items });
      }
      flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        tab.clock?.hide();
        report();
      } else tab.clock?.show();
    };
    // a page restored from the back/forward cache is viewed again, with a fresh id
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted || !tab.current) return;
      const path = tab.current.path;
      const id = newId();
      tab.current = { id, path, at: Date.now() };
      tab.clock = new Stopwatch();
      enqueue({ t: "view", id, path, gate: false, tc: navigator.maxTouchPoints > 1 }, true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", report);
    window.addEventListener("pageshow", onShow);
    return () => {
      for (const e of events) window.removeEventListener(e, poke, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", report);
      window.removeEventListener("pageshow", onShow);
    };
  }, [enabled]);

  return null;
}
