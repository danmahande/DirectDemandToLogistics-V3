/**
 * enhance-tile Route (v5 FIXED)
 *
 * Simple server-side proxy for satellite tiles.
 * No AI enhancement — just reliable tile caching.
 *
 * FIXED: Removed all AI code. Only ESRI satellite proxy with caching.
 */

import { NextRequest, NextResponse } from 'next/server'

interface CacheEntry {
  data: ArrayBuffer
  timestamp: number
  contentType: string
}

const tileCache = new Map<string, CacheEntry>()
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours
const MAX_CACHE_SIZE = 5000

function pruneCache() {
  if (tileCache.size <= MAX_CACHE_SIZE) return
  const entries = Array.from(tileCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
  const toRemove = Math.floor(entries.length * 0.25)
  for (let i = 0; i < toRemove; i++) {
    tileCache.delete(entries[i][0])
  }
}

/**
 * GET /api/enhance-tile?url=<tile_url>
 *
 * Proxies tile requests server-side to avoid CORS issues
 * and cache responses for performance.
 *
 * Only accepts URLs from trusted tile providers:
 * - ESRI World Imagery
 * - ESRI Clarity
 * - CARTO basemaps
 */
const ALLOWED_HOSTS = [
  'server.arcgisonline.com',
  'clarity.maptiles.arcgis.com',
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  'd.basemaps.cartocdn.com',
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tileUrl = searchParams.get('url')

    if (!tileUrl) {
      return NextResponse.json({ error: 'Tile URL required' }, { status: 400 })
    }

    // Security: Only proxy to allowed tile providers
    const tileUrlObj = new URL(tileUrl)
    if (!ALLOWED_HOSTS.some(host => tileUrlObj.hostname.endsWith(host))) {
      return NextResponse.json({ error: 'Tile URL not from allowed provider' }, { status: 403 })
    }

    const cacheKey = tileUrl

    // Check cache
    const cached = tileCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
        }
      })
    }

    // Fetch tile from external provider
    const response = await fetch(tileUrl, {
      headers: {
        'User-Agent': 'DirectDDL/5.0-Fixed',
        'Accept': 'image/png, image/jpeg, image/*'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Tile fetch failed' }, { status: response.status })
    }

    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/png'

    // Cache it
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
      }
    })

  } catch (error) {
    console.error('[TileProxyFixed] Error:', error)
    return NextResponse.json({ error: 'Tile proxy failed' }, { status: 500 })
  }
}
