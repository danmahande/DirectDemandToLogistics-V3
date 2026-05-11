/**
 * Tile Proxy API (v8 — DNS failure handling + CORS headers)
 *
 * v8 FIXES:
 * - Added CORS headers (Access-Control-Allow-Origin: *) for WebGL rendering
 * - Added OPTIONS handler for CORS preflight requests
 * - Added DNS failure detection (ENOTFOUND) with clear error messages
 * - Increased effective timeout (uses API_LIMITS.TILE_PROXY_TIMEOUT which is now 30s)
 *
 * NOTE: ESRI World Imagery tiles have CORS headers and load directly
 * in the browser WITHOUT needing this proxy. This proxy is only needed
 * for Google satellite tiles (mt1.google.com) which block direct browser access.
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

/** Common headers for all tile responses — includes CORS for WebGL */
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
        { status: response.status, headers: TILE_RESPONSE_HEADERS }
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/png'

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
    // Detect DNS resolution failures — common in Kampala networks
    const isDnsFailure = error instanceof TypeError && error.cause instanceof Error && error.cause.code === 'ENOTFOUND'
    const isTimeout = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')

    if (isDnsFailure) {
      console.error('[TileProxy] DNS resolution failed — the tile server hostname cannot be resolved from this network.')
      return NextResponse.json(
        { error: 'DNS resolution failed — tile server unreachable from this network', hint: 'Use ESRI World Imagery which loads directly without proxy' },
        { status: 502, headers: TILE_RESPONSE_HEADERS }
      )
    }

    if (isTimeout) {
      console.error('[TileProxy] Tile fetch timed out after', API_LIMITS.TILE_PROXY_TIMEOUT, 'ms')
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
