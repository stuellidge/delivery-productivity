type CacheEntry = { value: unknown; expiresAt: number }

/**
 * Simple in-memory cache with TTL support.
 * Intended to be used as a module-level singleton.
 */
export default class CacheService {
  private store = new Map<string, CacheEntry>()

  /**
   * Returns the cached value for `key` if it exists and has not expired.
   * Otherwise calls `fn`, caches its result for `ttlSeconds`, and returns it.
   */
  async remember<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const entry = this.store.get(key)
    const now = Date.now()

    if (entry && entry.expiresAt > now) {
      return entry.value as T
    }

    const value = await fn()
    this.store.set(key, { value, expiresAt: now + ttlSeconds * 1000 })
    return value
  }

  /**
   * Removes a specific key from the cache.
   */
  invalidate(key: string): void {
    this.store.delete(key)
  }

  /**
   * Removes all keys that start with the given prefix.
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key)
      }
    }
  }

  /**
   * Clears the entire cache. Useful in tests.
   */
  clear(): void {
    this.store.clear()
  }
}

// Module-level singleton
export const cache = new CacheService()
