/**
 * In-memory cache for content-frequency query results.
 * TTL: 5 minutes. Keyed by a hash of all filter params so different
 * filter combinations each get their own cache entry.
 */

interface CacheEntry {
  data: any
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 5 * 60 * 1000 // 5 minutes

export function getCached(key: string): any | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

export function setCached(key: string, data: any): void {
  // Evict stale entries if cache grows large
  if (cache.size > 200) {
    const now = Date.now()
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt) cache.delete(k)
    }
  }
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS })
}

// Bump this version whenever the shape of cached results changes
const CACHE_VERSION = "v5"

export function buildCacheKey(params: Record<string, string | null>): string {
  return CACHE_VERSION + ":" + Object.entries(params)
    .filter(([, v]) => v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&")
}
