/**
 * Tile Proxy API (v6 — FIXED)
 *
 * FIXED: Added Google Maps domains to allowed tile sources
 * so that the tile proxy can serve Google satellite tiles.
 *
 * Usage: GET /api/tile/proxy?url=<encoded_tile_url>
 */

import { NextRequest, NextResponse } from 'next/server'
import { API_LIMITS, USER_AGENTS } from '@/lib/config'

interface CacheEntry {
  data: ArrayBuffer
  timestamp: number
  contentType: string
}

const tileCache = new Map<string, CacheEntry>()

function pruneCache() {
  if (tileCache.size <= API_LIMITS.TILE_CACHE_MAX_SIZE) return
  const entries = Array.from(tileCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
  const toRemove = Math.floor(entries.length * API_LIMITS.TILE_CACHE_PRUNE_RATIO)
  for (let i = 0; i < toRemove; i++) {
    tileCache.delete(entries[i][0])
  }
}

/** FIXED: Added Google Maps domains */
function isAllowedTileUrl(url: string): boolean {
  const allowedHosts = [
    'server.arcgisonline.com',
    'clarity.maptiles.arcgis.com',
    'mt1.google.com',
    'mt2.google.com',
    'mt3.google.com',
    'a.basemaps.cartocdn.com',
    'b.basemaps.cartocdn.com',
    'c.basemaps.cartocdn.com',
    'd.basemaps.cartocdn.com',
    'tiles.openfreemap.org',
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
      return NextResponse.json({ error: 'Missing required parameter: url' }, { status: 400 })
    }

    if (!isAllowedTileUrl(tileUrl)) {
      return NextResponse.json({ error: 'Tile URL not from allowed source' }, { status: 403 })
    }

    const cacheKey = tileUrl
    const cached = tileCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < API_LIMITS.TILE_CACHE_DURATION) {
      return new NextResponse(cached.data, {
        headers: { 'Content-Type': cached.contentType, 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'HIT' },
      })
    }

    const response = await fetch(tileUrl, {
      headers: { 'User-Agent': USER_AGENTS.TILE_PROXY, 'Accept': 'image/png, image/jpeg, image/*' },
      signal: AbortSignal.timeout(API_LIMITS.TILE_PROXY_TIMEOUT),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Tile fetch failed', status: response.status }, { status: response.status })
    }

    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/png'

    tileCache.set(cacheKey, { data: arrayBuffer, timestamp: Date.now(), contentType })
    pruneCache()

    return new NextResponse(arrayBuffer, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'MISS' },
    })

  } catch (error) {
    console.error('[TileProxy] Error:', error)
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Tile fetch timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Tile proxy failed' }, { status: 500 })
  }
}
