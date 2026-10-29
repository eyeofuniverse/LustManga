/**
 * A small in-memory cache for database reads, per server process (the site runs as one long-lived container). Every
 * query costs a round trip to a database on another continent, so repeated reads of the same listing are answered from
 * memory. Stale-while-revalidate: once an answer is older than `seconds`, the next caller still gets it at once and a
 * single background refresh replaces it, so no visitor waits for a slow query except the very first. An answer that is
 * more than `seconds * 10` old is never served. A failed refresh keeps the old answer; a failed first read is not stored.
 * Values are kept as they are (Dates stay Dates), unlike Next's unstable_cache.
 */
export function memo<A extends unknown[], R>(seconds: number, fn: (...a: A) => Promise<R>, max = 500): (...a: A) => Promise<R> {
  type Entry = { at: number; value?: R; pending?: Promise<R> };
  const store = new Map<string, Entry>();

  const load = (key: string, e: Entry, args: A): Promise<R> => {
    const p = fn(...args).then(
      (value) => {
        e.value = value;
        e.at = Date.now();
        e.pending = undefined;
        return value;
      },
      (err) => {
        e.pending = undefined;
        if (e.value === undefined && store.get(key) === e) store.delete(key);
        throw err;
      },
    );
    e.pending = p;
    return p;
  };

  return (...args: A) => {
    const key = JSON.stringify(args);
    let e = store.get(key);
    if (!e) {
      e = { at: 0 };
      store.set(key, e);
      if (store.size > max) store.delete(store.keys().next().value as string);
      return load(key, e, args);
    }
    if (e.value === undefined) return e.pending ?? load(key, e, args);
    const age = Date.now() - e.at;
    if (age > seconds * 10_000) return e.pending ?? load(key, e, args);
    if (age > seconds * 1000 && !e.pending) load(key, e, args).catch(() => {});
    return Promise.resolve(e.value);
  };
}
