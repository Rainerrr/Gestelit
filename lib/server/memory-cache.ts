type CacheEntry<T> = { expiresAt: number; value: Promise<T>; pending: boolean };
const cache = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 128;

/** Bounded per-process cache. Coalesce concurrent reads; never retain failures. */
export function cachedFor<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && (existing.pending || existing.expiresAt > now)) return existing.value;
  for (const [k, entry] of cache) if (!entry.pending && entry.expiresAt <= now) cache.delete(k);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  const entry: CacheEntry<T> = { expiresAt: 0, pending: true, value: undefined as unknown as Promise<T> };
  entry.value = Promise.resolve().then(load).then(value => {
    entry.pending = false;
    entry.expiresAt = Date.now() + ttlMs;
    return value;
  }).catch(error => {
    // An invalidated older request must not evict its replacement.
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  });
  cache.set(key, entry);
  return entry.value;
}
export function clearMemoryCache(prefix?: string) {
  for (const key of cache.keys()) if (!prefix || key.startsWith(prefix)) cache.delete(key);
}
