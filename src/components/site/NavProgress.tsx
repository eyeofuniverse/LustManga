"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * A thin bar at the top that starts the moment an internal link is clicked and finishes when the new page
 * arrives. Pages here are rendered on the server, so without it a slow response feels like a dead click.
 */
function Bar() {
  const path = usePathname();
  const params = useSearchParams();
  const [w, setW] = useState(0);
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const giveUp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // the new page arrived: finish and fade
  useEffect(() => {
    clearInterval(timer.current);
    clearTimeout(giveUp.current);
    setW(100);
    const t = setTimeout(() => {
      setOn(false);
      setW(0);
    }, 260);
    return () => clearTimeout(t);
  }, [path, params]);

  // a click on an internal link: start creeping towards 85%
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      clearInterval(timer.current);
      setOn(true);
      setW(12);
      timer.current = setInterval(() => setW((x) => (x < 85 ? x + (85 - x) * 0.12 : x)), 180);
      // a click that never navigates (blocked, offline, an error page) must not leave the bar hanging
      clearTimeout(giveUp.current);
      giveUp.current = setTimeout(() => {
        clearInterval(timer.current);
        setOn(false);
        setW(0);
      }, 12_000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearInterval(timer.current);
      clearTimeout(giveUp.current);
    };
  }, []);

  return (
    <div aria-hidden="true" className={`pointer-events-none fixed inset-x-0 top-0 z-[90] h-0.5 transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full bg-gradient-to-r from-accent to-accent-2 shadow-[0_0_10px_rgb(var(--accent))] transition-[width] duration-200 ease-out" style={{ width: `${w}%` }} />
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
