"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** A horizontally scrolling row with snap points and edge arrows (desktop). On touch it is just a swipeable strip. */
export function ScrollRow({ children, label }: { children: React.ReactNode; label: string }) {
  const el = useRef<HTMLUListElement>(null);
  const [can, setCan] = useState({ l: false, r: true });

  const update = useCallback(() => {
    const e = el.current;
    if (!e) return;
    setCan({ l: e.scrollLeft > 4, r: e.scrollLeft + e.clientWidth < e.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const e = el.current;
    const ro = new ResizeObserver(update);
    if (e) ro.observe(e);
    return () => ro.disconnect();
  }, [update]);

  const by = (dir: 1 | -1) => el.current?.scrollBy({ left: dir * el.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <div className="group/row relative">
      <ul
        ref={el}
        onScroll={update}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 no-scrollbar sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:px-0 [&>li]:w-[38vw] [&>li]:shrink-0 [&>li]:snap-start sm:[&>li]:w-44 lg:[&>li]:w-48"
      >
        {children}
      </ul>
      {can.l && (
        <button type="button" onClick={() => by(-1)} aria-label="Scroll left" className="absolute -left-4 top-[38%] hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/95 shadow-card backdrop-blur transition hover:bg-surface-2 lg:grid">
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {can.r && (
        <button type="button" onClick={() => by(1)} aria-label="Scroll right" className="absolute -right-4 top-[38%] hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/95 shadow-card backdrop-blur transition hover:bg-surface-2 lg:grid">
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
