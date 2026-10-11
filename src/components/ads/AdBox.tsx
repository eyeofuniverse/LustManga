"use client";

import { useEffect, useRef, useState } from "react";
import { FRAME_SANDBOX, buildFrameDoc, injectCode, sendImpression } from "@/lib/ads/client";
import { useAdult } from "./useAdult";

export interface BoxAd {
  id: string;
  slot: string;
  type: "code" | "banner";
  code: string | null;
  isolation: "inline" | "frame";
  width: number | null;
  height: number | null;
}

/**
 * The box around one ad. A banner arrives already rendered by the server (as `children`); an ad network's code is run here,
 * and only when it is worth it:
 *   - not until the visitor has confirmed they are an adult, and not while the box is far from the screen (a slot at the
 *     bottom of a page costs nothing until someone scrolls there);
 *   - the box keeps the ad's size from the start, so nothing around it moves when the ad arrives.
 * An impression is counted once the box has been at least half in view for a second, never earlier.
 */
export function AdBox({ ad, className = "", children }: { ad: BoxAd; className?: string; children?: React.ReactNode }) {
  const adult = useAdult();
  const box = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const counted = useRef(false);

  // close to the screen: time to run the ad
  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  // seen: half in view for a second
  useEffect(() => {
    const el = box.current;
    if (!adult || !el || counted.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.some((x) => x.isIntersecting && x.intersectionRatio >= 0.5);
        clearTimeout(timer);
        if (seen && !counted.current)
          timer = setTimeout(() => {
            if (counted.current) return;
            counted.current = true;
            sendImpression(ad.id);
            io.disconnect();
          }, 1000);
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, [adult, ad.id]);

  // an ad network's code that runs in the page
  useEffect(() => {
    const el = holder.current;
    if (!adult || !near || !el || ad.type !== "code" || ad.isolation !== "inline" || !ad.code || el.childElementCount) return;
    injectCode(el, ad.code);
    // the ad creative is an iframe the network makes itself, so there is no markup of ours to give it a title: do it as it appears
    const title = () => el.querySelectorAll("iframe:not([title]):not([aria-label])").forEach((f) => f.setAttribute("title", "Advertisement"));
    title();
    const mo = new MutationObserver(title);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [adult, near, ad.type, ad.isolation, ad.code]);

  const fixedHeight = ad.type === "code" && ad.height ? { height: ad.height } : undefined;
  return (
    <div
      ref={box}
      role="group"
      aria-label="Advertisement"
      data-ad-slot={ad.slot}
      data-ad-id={ad.id}
      className={`mx-auto w-full ${className}`}
      style={{ maxWidth: ad.width ?? undefined }}
    >
      <p className="mb-1.5 text-center text-[10px] uppercase tracking-[0.2em] text-muted" aria-hidden="true">
        Advertisement
      </p>
      {ad.type === "banner" ? (
        children
      ) : (
        <div ref={holder} className="relative isolate flex max-w-full justify-center overflow-hidden [contain:layout_paint_style]" style={fixedHeight}>
          {adult && near && ad.isolation === "frame" && ad.code && (
            <iframe
              title="Advertisement"
              sandbox={FRAME_SANDBOX}
              srcDoc={buildFrameDoc(ad.code)}
              loading="lazy"
              scrolling="no"
              width={ad.width ?? undefined}
              height={ad.height ?? undefined}
              className="max-w-full border-0"
              referrerPolicy="origin"
            />
          )}
        </div>
      )}
    </div>
  );
}
