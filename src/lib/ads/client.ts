import { optedOut } from "@/lib/analytics/client";

/** The browser half of the ads: counting a box that was really seen, and running an ad network's embed code. */

/** The page an isolated ad runs in: its own document, links opening in a new tab, nothing around the ad. */
export function buildFrameDoc(code: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}body{display:flex;justify-content:center}</style></head><body>${code}</body></html>`;
}

/** Everything an isolated ad frame is allowed to do. It cannot read the site's pages, cookies or storage (no allow-same-origin). */
export const FRAME_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation";

/**
 * A box was seen. The site's own count: nothing identifies the visitor, and nothing is sent for a visitor who has asked not to
 * be measured (Do Not Track, Global Privacy Control) or for an automated browser.
 */
export function sendImpression(adId: string): void {
  if (typeof window === "undefined" || optedOut()) return;
  const body = JSON.stringify({ ad: adId });
  try {
    if (navigator.sendBeacon?.("/api/ads/i", new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* fall through to fetch */
  }
  fetch("/api/ads/i", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/**
 * Put an ad network's embed code (HTML and scripts) into `target` and make its scripts run, which setting innerHTML alone
 * does not do. A network's loader script is the same file in every zone's code; a page with several ad boxes would
 * otherwise download and run it once per box, so a loader that is already on the page is not added again. (The loader is
 * a queue that every zone pushes onto, so each zone still registers itself through its own inline script.)
 */
export function injectCode(target: Element, html: string): void {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const scripts = Array.from(document.scripts);
  for (const node of Array.from(tpl.content.childNodes)) {
    if (node instanceof HTMLScriptElement) {
      if (node.src && scripts.some((s) => s.src === node.src)) continue;
      const next = document.createElement("script");
      for (const a of Array.from(node.attributes)) next.setAttribute(a.name, a.value);
      next.textContent = node.textContent;
      target.appendChild(next);
    } else {
      // scripts nested inside other elements must be re-created too, or they would be inert
      const clone = node.cloneNode(true);
      if (clone instanceof Element) {
        clone.querySelectorAll("script").forEach((old) => {
          if (old.src && scripts.some((s) => s.src === old.src)) return old.remove();
          const next = document.createElement("script");
          for (const a of Array.from(old.attributes)) next.setAttribute(a.name, a.value);
          next.textContent = old.textContent;
          old.replaceWith(next);
        });
      }
      target.appendChild(clone);
    }
  }
}
