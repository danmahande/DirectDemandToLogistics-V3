import { NextRequest, NextResponse } from 'next/server'
import { API_LIMITS, USER_AGENTS } from '@/lib/config'

// ═══════════════════════════════════════════════════════════
// TILE PROXY API (v5 — NEW)
// ═══════════════════════════════════════════════════════════
// Server-side proxy for satellite tile requests.
// Caches tiles in memory for fast repeated access.
// No AI enhancement — just reliable tile serving.
//
// Usage: GET /api/tile-proxy?url=<encoded_tile_url>
// ═══════════════════════════════════════════════════════════

interface CacheEntry {
  data: ArrayBuffer
  timestamp: number
  contentType: string
}

const tileCache = new Map<string, CacheEntry>()

/** Remove oldest 25% of cache entries when size exceeds max */
function pruneCache() {
  if (tileCache.size <= API_LIMITS.TILE_CACHE_MAX_SIZE) return
  const entries = Array.from(tileCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
  const toRemove = Math.floor(entries.length * API_LIMITS.TILE_CACHE_PRUNE_RATIO)
  for (let i = 0; i < toRemove; i++) {
    tileCache.delete(entries[i][0])
  }
}

/** Validate that a URL is an allowed tile source to prevent SSRF */
function isAllowedTileUrl(url: string): boolean {
  const allowedHosts = [
    'server.arcgisonline.com',
    'clarity.maptiles.arcgis.com',
    'a.basemaps.cartocdn.com',
    'b.basemaps.cartocdn.com',
    'c.basemaps.cartocdn.com',
    'd.basemaps.cartocdn.com',
  ]
  try {
    const parsed = new URL(url)
    return allowedHosts.some(host => parsed.hostname.endsWith(host))
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tileUrl = searchParams.get('url')

    if (!tileUrl) {
      return NextResponse.json(
        { error: 'Missing required parameter: url' },
        { status: 400 }
      )
    }

    // Security: only allow whitelisted tile sources
    if (!isAllowedTileUrl(tileUrl)) {
      return NextResponse.json(
        { error: 'Tile URL not from allowed source' },
        { status: 403 }
      )
    }

    const cacheKey = tileUrl

    // Check cache first
    const cached = tileCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < API_LIMITS.TILE_CACHE_DURATION) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
          'X-Cache-Age': Math.round((Date.now() - cached.timestamp) / 1000) + 's',
        },
      })
    }

    // Fetch tile from external provider
    const response = await fetch(tileUrl, {
      headers: {
        'User-Agent': USER_AGENTS.TILE_PROXY,
        'Accept': 'image/png, image/jpeg, image/*',
      },
      signal: AbortSignal.timeout(API_LIMITS.TILE_PROXY_TIMEOUT),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Tile fetch failed', status: response.status },
        { status: response.status }
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/png'

    // Store in cache
    tileCache.set(cacheKey, {
      data: arrayBuffer,
      timestamp: Date.now(),
      contentType,
    })
    pruneCache()

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
      },
    })

  } catch (error) {
    console.error('[TileProxy] Error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Tile fetch timed out' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: 'Tile proxy failed' },
      { status: 500 }
    )
  }
}
