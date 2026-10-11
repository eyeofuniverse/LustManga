import type { EventName } from "./payload";

/**
 * The browser half of the analytics. Everything here is best effort and silent: measuring must never slow the page, throw,
 * or show anything. No cookie and no storage is used, and nothing is sent when the visitor has asked not to be measured.
 */
const ENDPOINT = "/api/t";
const FLUSH_MS = 2000;
const IDLE_MS = 60_000; // no input for a minute: the visitor has walked away, the clock stops

type Wire = Record<string, unknown>;
const queue: Wire[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let allowed = false; // set by <Tracker> once the server has said analytics is on

export const newId = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Do Not Track, Global Privacy Control, and automated browsers (which are not visitors). */
export function optedOut(): boolean {
  if (typeof navigator === "undefined") return true;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  const w = window as Window & { doNotTrack?: string | null };
  return n.doNotTrack === "1" || w.doNotTrack === "1" || n.globalPrivacyControl === true || n.webdriver === true;
}

export function allow(on: boolean) {
  allowed = on && !optedOut();
  if (!allowed) queue.length = 0;
}

function post(items: Wire[]) {
  if (!items.length) return;
  const body = JSON.stringify({ items });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* fall through to fetch */
  }
  fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
}

/** Send what is queued now (page is hiding, or the timer ran out). */
export function flush() {
  clearTimeout(timer);
  timer = undefined;
  if (!allowed) {
    queue.length = 0;
    return;
  }
  post(queue.splice(0, queue.length));
}

/** Queue one item and send it with whatever else arrives in the next couple of seconds. */
export function enqueue(item: Wire, now = false) {
  if (typeof window === "undefined") return;
  queue.push(item);
  if (now) flush();
  else timer ??= setTimeout(flush, FLUSH_MS);
}

export interface TrackProps {
  work?: number;
  label?: string;
  v?: number;
  tot?: number;
}

/** Record something the visitor did. Safe to call anywhere on the client; does nothing on the server or when opted out. */
export function track(name: EventName, props: TrackProps = {}) {
  if (typeof window === "undefined") return;
  enqueue({ t: "ev", id: newId(), n: name, path: location.pathname, ...props });
}

/**
 * Time a visitor actually spent on a page: the tab is in front and they have done something in the last minute. Counting
 * wall-clock time would credit a tab left open overnight.
 */
export class Stopwatch {
  private seconds = 0;
  private last = performance.now();
  private active = performance.now();
  private visible = typeof document === "undefined" ? true : document.visibilityState === "visible";

  private tick() {
    const now = performance.now();
    if (this.visible) {
      const end = Math.min(now, this.active + IDLE_MS);
      if (end > this.last) this.seconds += (end - this.last) / 1000;
    }
    this.last = now;
  }
  poke() {
    this.tick();
    this.active = this.last;
  }
  show() {
    this.last = performance.now();
    this.active = this.last;
    this.visible = true;
  }
  hide() {
    this.tick();
    this.visible = false;
  }
  read(): number {
    this.tick();
    return Math.min(3600, Math.round(this.seconds));
  }
}
