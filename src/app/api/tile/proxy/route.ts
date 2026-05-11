
import { NextRequest, NextResponse } from 'next/server'
import { API_LIMITS, USER_AGENTS } from '@/lib/config'

interface CacheEntry {
  data: ArrayBuffer
  timestamp: number
  contentType: string
}

const tileCache = new Map<string, CacheEntry>()

/** CORS headers for all responses — required for WebGL rendering */
const TILE_RESPONSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function pruneCache() {
  if (tileCache.size <= API_LIMITS.TILE_CACHE_MAX_SIZE) return
  const entries = Array.from(tileCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
  const toRemove = Math.floor(entries.length * API_LIMITS.TILE_CACHE_PRUNE_RATIO)
  for (let i = 0; i < toRemove; i++) {
    tileCache.delete(entries[i][0])
  }
}

/** Check if the tile URL is from an allowed source */
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

/** Handle CORS preflight requests */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: TILE_RESPONSE_HEADERS,
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tileUrl = searchParams.get('url')

    if (!tileUrl) {
      return NextResponse.json(
        { error: 'Missing required parameter: url' },
        { status: 400, headers: TILE_RESPONSE_HEADERS }
      )
    }

    if (!isAllowedTileUrl(tileUrl)) {
      return NextResponse.json(
        { error: 'Tile URL not from allowed source' },
        { status: 403, headers: TILE_RESPONSE_HEADERS }
      )
    }

    // Check cache
    const cacheKey = tileUrl
    const cached = tileCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < API_LIMITS.TILE_CACHE_DURATION) {
      return new NextResponse(cached.data, {
        headers: {
          ...TILE_RESPONSE_HEADERS,
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
        },
      })
    }

    // Fetch from external server
    const response = await fetch(tileUrl, {
      headers: {
        'User-Agent': USER_AGENTS.TILE_PROXY,
        'Accept': '*/*',  // v9: accept all content types (raster + vector tiles)
      },
      signal: AbortSignal.timeout(API_LIMITS.TILE_PROXY_TIMEOUT),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Tile fetch failed', status: response.status },
        { status: response.status, headers: TILE_RESPONSE_HEADERS }
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/png'

    // Cache result
    tileCache.set(cacheKey, { data: arrayBuffer, timestamp: Date.now(), contentType })
    pruneCache()

    return new NextResponse(arrayBuffer, {
      headers: {
        ...TILE_RESPONSE_HEADERS,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
      },
    })

  } catch (error) {
    // Detect DNS resolution failures — return fast error
    const cause = error instanceof TypeError && error.cause instanceof Error ? error.cause : null
    const isDnsFailure = cause && (cause.code === 'ENOTFOUND' || cause.code === 'EAI_AGAIN')
    const isTimeout = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')

    if (isDnsFailure) {
      console.error(`[TileProxy] DNS failed for: ${cause?.hostname || 'unknown'}`)
      return NextResponse.json(
        { error: `DNS resolution failed for ${cause?.hostname || 'tile server'}` },
        { status: 502, headers: TILE_RESPONSE_HEADERS }
      )
    }

    if (isTimeout) {
      return NextResponse.json(
        { error: 'Tile fetch timed out' },
        { status: 504, headers: TILE_RESPONSE_HEADERS }
      )
    }

    console.error('[TileProxy] Error:', error)
    return NextResponse.json(
      { error: 'Tile proxy failed' },
      { status: 500, headers: TILE_RESPONSE_HEADERS }
    )
  }
}
