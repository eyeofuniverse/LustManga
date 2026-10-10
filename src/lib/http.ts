export const UA = "LustManga/0.1 (+https://github.com/eyeofuniverse/LustManga)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polite fetch wrapper: minimum gap between calls, retry with backoff on 429/5xx/network errors. */
export class Http {
  /** earliest time the next request may start; claimed synchronously so concurrent callers queue up */
  private next = 0;
  constructor(
    private minGapMs = 250,
    private headers: Record<string, string> = {},
  ) {}

  private async gap() {
    const now = Date.now();
    const start = Math.max(now, this.next);
    this.next = start + this.minGapMs; // reserve before awaiting: no two callers can share a slot
    if (start > now) await sleep(start - now);
  }

  async request(url: string, init: RequestInit = {}, attempts = 5): Promise<Response> {
    let lastErr: unknown;
    for (let i = 1; i <= attempts; i++) {
      await this.gap();
      try {
        const res = await fetch(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(45_000),
          ...init,
          headers: { "user-agent": UA, ...this.headers, ...(init.headers as Record<string, string>) },
        });
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get("retry-after")) || 0;
          const reset = Number(res.headers.get("x-ratelimit-retry-after")) || 0;
          const until = reset ? reset * 1000 - Date.now() : ra * 1000;
          lastErr = new Error(`HTTP ${res.status} ${url}`);
          await sleep(Math.min(60_000, Math.max(until, 1000 * 2 ** i)));
          continue;
        }
        return res;
      } catch (e) {
        lastErr = e;
        await sleep(Math.min(20_000, 800 * 2 ** i));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.request(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return (await res.json()) as T;
  }
}

/** Run `fn` over `items` with at most `n` in flight. Order of results matches input. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * A counting semaphore: `run(fn)` starts `fn` once fewer than `max` calls are in flight, so a whole process stays under
 * a host's limit however many galleries and pages are being worked on at once.
 */
export function gate(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = () => {
    active--;
    waiting.shift()?.();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
