// Simple in-memory cache with TTL (server-only)

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<any>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

export function cachePeek<T>(key: string): { value: T; expires: number; isExpired: boolean } | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  return {
    value: entry.value as T,
    expires: entry.expires,
    isExpired: Date.now() > entry.expires,
  };
}
