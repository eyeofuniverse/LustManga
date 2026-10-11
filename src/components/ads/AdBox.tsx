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
 *   - the box keeps the ad's size from the start, so nothing around it moves when the ad arrives. An ad wider than the screen
 *     (a 728-pixel leaderboard on a phone) is scaled down to fit instead of being cut off.
 * An impression is counted once the box has been at least half in view for a second, never earlier.
 */
export function AdBox({ ad, className = "", children }: { ad: BoxAd; className?: string; children?: React.ReactNode }) {
  const adult = useAdult();
  const box = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [scale, setScale] = useState(1);
  const counted = useRef(false);

  // close to the screen: time to run the ad
  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") return setNear(true); // a very old browser: run it
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  // seen: half in view for a second
  useEffect(() => {
    const el = box.current;
    if (!adult || !el || counted.current) return;
    const count = () => {
      if (counted.current) return;
      counted.current = true;
      sendImpression(ad.id);
    };
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(count, 1000);
      return () => clearTimeout(t);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.some((x) => x.isIntersecting && x.intersectionRatio >= 0.5);
        clearTimeout(timer);
        if (seen && !counted.current)
          timer = setTimeout(() => {
            count();
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

  // a fixed-size ad wider than its box is scaled down to fit
  useEffect(() => {
    const el = box.current;
    if (!el || ad.type !== "code" || !ad.width || typeof ResizeObserver === "undefined") return;
    const w = ad.width;
    const fit = () => setScale(Math.min(1, el.clientWidth / w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ad.type, ad.width]);

  // an ad network's code that runs in the page
  useEffect(() => {
    const el = holder.current;
    if (!adult || !near || !el || ad.type !== "code" || ad.isolation !== "inline" || !ad.code || el.childElementCount) return;
    void injectCode(el, ad.code);
    // the ad creative is an iframe the network makes itself, so there is no markup of ours to give it a title: do it as it appears
    const title = () => el.querySelectorAll("iframe:not([title]):not([aria-label])").forEach((f) => f.setAttribute("title", "Advertisement"));
    title();
    const mo = new MutationObserver(title);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [adult, near, ad.type, ad.isolation, ad.code]);

  const w = ad.width ?? undefined;
  const h = ad.height ?? undefined;
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
        // the outer box takes the space the (possibly scaled) ad will occupy; the inner one holds the ad at its real size
        <div className="relative mx-auto max-w-full overflow-hidden" style={{ width: w ? w * scale : undefined, height: h ? h * scale : undefined }}>
          <div
            ref={holder}
            className="relative isolate flex justify-center [contain:layout_paint_style]"
            style={{ width: w, height: h, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "0 0" }}
          >
            {adult && near && ad.isolation === "frame" && ad.code && (
              <iframe
                title="Advertisement"
                sandbox={FRAME_SANDBOX}
                srcDoc={buildFrameDoc(ad.code)}
                loading="lazy"
                scrolling="no"
                width={w}
                height={h}
                className="max-w-none border-0"
                referrerPolicy="origin"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
