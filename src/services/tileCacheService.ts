/**
 * Server-Side Tile Cache Service - v5.0
 *
 * Provides server-side tile caching for the AI enhancement pipeline.
 * This service is used by API routes to cache tiles in-memory
 * with TTL-based expiration and size-based pruning.
 *
 * Features:
 * - Separate caches for proxy tiles, AI-enhanced tiles, and originals
 * - TTL-based expiration (configurable per cache type)
 * - LRU-style pruning when caches exceed max size
 * - Cache stats for monitoring
 * - Thread-safe operations (single Node.js process)
 */

import type { ServerTileCacheEntry, AITileCacheEntry } from '@/types/map'
import { CACHE_CONFIG } from '@/lib/config'

// ============================================
// GENERIC CACHE IMPLEMENTATION
// ============================================

interface CacheOptions {
  maxEntries: number
  ttlMs: number
  name: string
}

class TileCache<T extends { timestamp: number }> {
  private cache: Map<string, T> = new Map()
  private options: CacheOptions

  constructor(options: CacheOptions) {
    this.options = options
  }

  get(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check TTL
    if (Date.now() - entry.timestamp > this.options.ttlMs) {
      this.cache.delete(key)
      return null
    }

    return entry
  }

  set(key: string, value: T): void {
    this.cache.set(key, value)

    // Prune if over max size
    if (this.cache.size > this.options.maxEntries) {
      this.prune()
    }
  }

  has(key: string): boolean {
    const entry = this.get(key)
    return entry !== null
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  /**
   * Prune the cache by removing the oldest 25% of entries
   */
  private prune(): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)

    const toRemove = Math.floor(entries.length * 0.25)
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0])
    }
    console.log(`[TileCache:${this.options.name}] Pruned ${toRemove} entries, ${this.cache.size} remaining`)
  }

  getStats() {
    return {
      name: this.options.name,
      size: this.cache.size,
      maxEntries: this.options.maxEntries,
      ttlMs: this.options.ttlMs
    }
  }
}

// ============================================
// SPECIALIZED CACHES
// ============================================

/**
 * Proxy tile cache - caches raw satellite tiles fetched from external providers
 */
const proxyCache = new TileCache<ServerTileCacheEntry>({
  name: 'proxy',
  maxEntries: CACHE_CONFIG.serverProxyCacheMax,
  ttlMs: CACHE_CONFIG.serverProxyCacheTTL
})

/**
 * AI-enhanced tile cache - caches tiles processed by the AI pipeline
 */
const aiCache = new TileCache<AITileCacheEntry>({
  name: 'ai-enhanced',
  maxEntries: CACHE_CONFIG.serverAICacheMax,
  ttlMs: CACHE_CONFIG.serverAICacheTTL
})

/**
 * Original tile cache - caches the raw original tiles for AI processing
 */
const originalCache = new TileCache<{ data: ArrayBuffer; timestamp: number; contentType: string }>({
  name: 'original',
  maxEntries: CACHE_CONFIG.serverOriginalCacheMax,
  ttlMs: CACHE_CONFIG.serverProxyCacheTTL
})

// ============================================
// TILE CACHE SERVICE
// ============================================

export const tileCacheService = {
  // Proxy cache
  getProxyTile: (key: string) => proxyCache.get(key),
  setProxyTile: (key: string, entry: ServerTileCacheEntry) => proxyCache.set(key, entry),
  hasProxyTile: (key: string) => proxyCache.has(key),

  // AI cache
  getAITile: (key: string) => aiCache.get(key),
  setAITile: (key: string, entry: AITileCacheEntry) => aiCache.set(key, entry),
  hasAITile: (key: string) => aiCache.has(key),

  // Original cache
  getOriginalTile: (key: string) => originalCache.get(key),
  setOriginalTile: (key: string, entry: { data: ArrayBuffer; timestamp: number; contentType: string }) => originalCache.set(key, entry),

  /**
   * Build a cache key from tile coordinates
   */
  buildKey: (z: number | string, x: number | string, y: number | string, ...extra: string[]): string => {
    return [z, x, y, ...extra].join('/')
  },

  /**
   * Clear all caches
   */
  clearAll: () => {
    proxyCache.clear()
    aiCache.clear()
    originalCache.clear()
  },

  /**
   * Get stats for all caches
   */
  getStats: () => ({
    proxy: proxyCache.getStats(),
    ai: aiCache.getStats(),
    original: originalCache.getStats(),
    totalEntries: proxyCache.size + aiCache.size + originalCache.size
  })
}

export default tileCacheService
