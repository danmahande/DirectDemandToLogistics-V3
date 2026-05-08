import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════
// SATELLITE TILE PROXY (v1 — NEW)
// ═══════════════════════════════════════════════════════════
// Proxies Google Maps satellite tiles to bypass CORS and
// direct-access restrictions in the browser.
//
// Without this proxy, Google satellite tiles fail silently
// in MapLibre GL JS, causing the map to render only vector
// layers (buildings + landuse) which creates an infra-red
// appearance instead of true-color satellite imagery.
//
// Usage: GET /api/tiles/satellite?z={z}&x={x}&y={y}
//
// Returns: Satellite tile image (JPEG/PNG)
// ═══════════════════════════════════════════════════════════

const GOOGLE_SATELLITE_BASE = 'https://mt1.google.com/vt/lyrs=s'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours — satellite imagery rarely changes
const TILE_TIMEOUT = 15000 // 15s per tile fetch

interface TileCacheEntry {
  data: ArrayBuffer
  timestamp: number
  contentType: string
}

const tileCache = new Map<string, TileCacheEntry>()
const MAX_CACHE_SIZE = 2000

function pruneCache() {
  if (tileCache.size <= MAX_CACHE_SIZE) return
  // Remove oldest 25% of entries
  const entries = Array.from(tileCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
  const toRemove = Math.floor(entries.length * 0.25)
  for (let i = 0; i < toRemove; i++) {
    tileCache.delete(entries[i][0])
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const z = searchParams.get('z')
    const x = searchParams.get('x')
    const y = searchParams.get('y')

    if (!z || !x || !y) {
      return NextResponse.json(
        { error: 'Missing required parameters: z, x, y' },
        { status: 400 }
      )
    }

    // Validate tile coordinates
    const zNum = parseInt(z)
    const xNum = parseInt(x)
    const yNum = parseInt(y)

    if (isNaN(zNum) || isNaN(xNum) || isNaN(yNum)) {
      return NextResponse.json(
        { error: 'Invalid tile coordinates. z, x, y must be integers.' },
        { status: 400 }
      )
    }

    if (zNum < 0 || zNum > 22) {
      return NextResponse.json(
        { error: 'Invalid zoom level. z must be between 0 and 22.' },
        { status: 400 }
      )
    }

    // Check cache
    const cacheKey = `${z}/${x}/${y}`
    const cached = tileCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
        },
      })
    }

    // Fetch from Google Maps tile server
    const tileUrl = `${GOOGLE_SATELLITE_BASE}&x=${xNum}&y=${yNum}&z=${zNum}`

    const response = await fetch(tileUrl, {
      headers: {
        'User-Agent': 'DirectDDL-SatelliteProxy/1.0',
        'Accept': 'image/png, image/jpeg, image/*',
      },
      signal: AbortSignal.timeout(TILE_TIMEOUT),
    })

    if (!response.ok) {
      console.error(`[Satellite Proxy] Google tile fetch failed: ${response.status} for z=${z} x=${x} y=${y}`)
      return NextResponse.json(
        { error: 'Satellite tile fetch failed', status: response.status },
        { status: response.status === 403 ? 502 : response.status }  // 403 from Google = bad gateway for client
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'

    // Cache the tile
    tileCache.set(cacheKey, { data: arrayBuffer, timestamp: Date.now(), contentType })
    pruneCache()

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
        'X-Tile-Source': 'google-satellite',
      },
    })

  } catch (error) {
    console.error('[Satellite Proxy] Error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Satellite tile fetch timed out' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: 'Satellite tile proxy failed' },
      { status: 500 }
    )
  }
}
