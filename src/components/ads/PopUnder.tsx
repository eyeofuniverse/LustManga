"use client";

import { useEffect } from "react";
import { injectCode, sendImpression } from "@/lib/ads/client";
import { useAdult } from "./useAdult";

let loaded = false; // once per page load, even when the layout around it is swapped for the other one (site <-> reader)

/**
 * The site-wide pop-under: the network's script, loaded once per page after the visitor has confirmed they are an adult, at an
 * idle moment so it never competes with the page for the first seconds. How often it opens is the network's setting (set a
 * frequency limit in the zone). It is never loaded in the console, and the server does not render it for robots or admins.
 */
export function PopUnder({ id, code }: { id: string; code: string }) {
  const adult = useAdult();
  useEffect(() => {
    if (!adult || loaded) return;
    const run = () => {
      if (loaded) return;
      loaded = true;
      void injectCode(document.head, code);
      sendImpression(id);
    };
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const cic = window.cancelIdleCallback ?? window.clearTimeout;
    const h = ric(run, { timeout: 4000 });
    return () => cic(h);
  }, [adult, id, code]);
  return null;
}
