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
  seen.push(adId);
  if (seen.length >= MAX_BATCH) flushImpressions();
  else timer ??= setTimeout(flushImpressions, BATCH_MS);
}

// A page with several ad boxes used to make one request to the server per box. They are collected for a couple of seconds
// and sent together (and at once when the page is being left), which is one request per page instead of three or four.
const BATCH_MS = 2000;
const MAX_BATCH = 20; // the server takes no more than this in one request
const seen: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

export function flushImpressions(): void {
  clearTimeout(timer);
  timer = undefined;
  if (!seen.length || typeof window === "undefined") return;
  const body = JSON.stringify({ ads: seen.splice(0, MAX_BATCH) });
  try {
    if (navigator.sendBeacon?.("/api/ads/i", new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* fall through to fetch */
  }
  fetch("/api/ads/i", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

if (typeof window !== "undefined") {
  addEventListener("pagehide", flushImpressions);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushImpressions();
  });
}

/** Elements an ad network's code leaves in the page that show nothing. */
const SILENT = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE"]);

/**
 * Has the network put anything on screen yet? Its loader script and the empty tag it later fills (an `ins`) do not count, so a
 * zone that has no ad to give (nothing to sell for this visitor, or a blocker stopped the loader) still reads as empty.
 */
export function hasContent(root: Element): boolean {
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (SILENT.has(el.tagName)) continue;
    if (el.tagName === "INS" && !el.childElementCount && !el.textContent?.trim()) continue;
    return true;
  }
  return false;
}

/** How long a network gets to fill its box before the empty space is given back to the page. */
export const NO_FILL_MS = 10_000;

/**
 * Put an ad network's embed code (HTML and scripts) into `target` and make its scripts run, which setting innerHTML alone
 * does not do. A network's loader script is the same file in every zone's code; a page with several ad boxes would
 * otherwise download and run it once per box, so a loader that is already on the page is not added again. (The loader is
 * a queue that every zone pushes onto, so each zone still registers itself through its own inline script.)
 */
export async function injectCode(target: Element, html: string): Promise<void> {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const scripts = Array.from(document.scripts);
  const live = (old: HTMLScriptElement): HTMLScriptElement => {
    const next = document.createElement("script");
    for (const a of Array.from(old.attributes)) next.setAttribute(a.name, a.value);
    next.textContent = old.textContent;
    if (old.src && !old.hasAttribute("async")) next.async = false;
    return next;
  };
  /** resolves when the script has loaded (or failed, or 8 seconds have passed: one slow network must not stop the rest) */
  const loaded = (s: HTMLScriptElement) =>
    new Promise<void>((done) => {
      s.addEventListener("load", () => done(), { once: true });
      s.addEventListener("error", () => done(), { once: true });
      setTimeout(done, 8000);
    });
  for (const node of Array.from(tpl.content.childNodes)) {
    if (node instanceof HTMLScriptElement) {
      if (node.src && scripts.some((s) => s.src === node.src)) continue;
      // A page's own parser runs <script src="lib.js"></script><script>lib.start()</script> in that order. A script made with
      // createElement does not: an inline one runs the moment it is inserted, before the file has loaded. So a script that did
      // not ask to be async is waited for before the next piece of the ad code is inserted.
      const next = live(node);
      const wait = node.src && !node.hasAttribute("async") ? loaded(next) : null;
      target.appendChild(next);
      if (wait) await wait;
    } else {
      // scripts nested inside other elements must be re-created too, or they would be inert
      const clone = node.cloneNode(true);
      if (clone instanceof Element) {
        clone.querySelectorAll("script").forEach((old) => {
          if (old.src && scripts.some((s) => s.src === old.src)) return old.remove();
          old.replaceWith(live(old));
        });
      }
      target.appendChild(clone);
    }
  }
}
