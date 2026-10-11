"use client";

import { useEffect, useState } from "react";

/**
 * True once the visitor has confirmed they are an adult. The age gate marks the page (`data-gated`), and an ad network's
 * script must not run, and an impression must not be counted, while the gate is still showing. The layouts' own wrapper
 * carries the mark, and it changes without a page load when the visitor enters.
 */
export function useAdult(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const target = document.getElementById("site-content");
    if (!target) return;
    const check = () => setOk(target.getAttribute("data-gated") !== "true");
    check();
    const mo = new MutationObserver(check);
    mo.observe(target, { attributes: true, attributeFilter: ["data-gated"] });
    return () => mo.disconnect();
  }, []);
  return ok;
}
