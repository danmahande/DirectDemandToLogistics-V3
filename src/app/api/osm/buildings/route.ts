import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════
// OSM BUILDINGS API (v8 — DNS resilience + Overpass failover)
// ═══════════════════════════════════════════════════════════
// Fetches building data from OpenStreetMap Overpass API
// for a given bounding box around Kampala.
//
// Usage: GET /api/osm/buildings?bbox=south,west,north,east
//
// Returns: GeoJSON FeatureCollection of buildings with height data
//
// v8 FIXES:
// - Multiple Overpass API mirrors with automatic failover
// - Retry with backoff on 429 (rate limit) responses
// - DNS failure detection (ENOTFOUND) — skip unreachable mirrors fast
// - Rounded bbox for better cache hit rate
// - 30s timeout per mirror attempt
// - Overall request timeout protection
// ═══════════════════════════════════════════════════════════

// Multiple Overpass API endpoints — try each in order on failure
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const CACHE_DURATION = 6 * 60 * 60 * 1000 // 6 hours

interface BuildingCacheEntry {
  data: unknown
  timestamp: number
}

const buildingCache = new Map<string, BuildingCacheEntry>()

/**
 * Round bbox coordinates to 3 decimal places (~111m precision)
 * to increase cache hit rate for slightly different viewport positions.
 */
function roundBbox(bbox: string): string {
  return bbox
    .split(',')
    .map(v => parseFloat(v).toFixed(3))
    .join(',')
}

/**
 * Build Overpass QL query for buildings in a bounding box
 */
function buildOverpassQuery(bbox: string): string {
  return `
[out:json][timeout:30];
(
  way["building"](${bbox});
  relation["building"](${bbox});
);
out body;
>;
out skel qt;
`
}

/**
 * Check if an error is a DNS resolution failure
 */
function isDnsError(error: unknown): boolean {
  if (error instanceof TypeError && error.cause instanceof Error) {
    return error.cause.code === 'ENOTFOUND' || error.cause.code === 'EAI_AGAIN'
  }
  return false
}

/**
 * Try fetching from Overpass API with mirror failover and 429 retry.
 * Skips DNS-unreachable mirrors quickly instead of waiting for timeout.
 */
async function fetchFromOverpass(query: string): Promise<Response> {
  const maxRetries = 2
  const retryDelay = 3000
  const dnsFailedMirrors = new Set<string>()

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (const mirrorUrl of OVERPASS_MIRRORS) {
      // Skip mirrors that already failed DNS resolution
      if (dnsFailedMirrors.has(mirrorUrl)) {
        continue
      }

      try {
        const response = await fetch(mirrorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'DirectDDL/8.0 (Kampala Logistics)',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(30000),
        })

        // Success
        if (response.ok) {
          return response
        }

        // 429 rate limit — wait and retry
        if (response.status === 429) {
          console.warn(`[OSM Buildings] Rate limited (429) on ${mirrorUrl}, attempt ${attempt + 1}/${maxRetries}`)
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            continue
          }
          continue
        }

        // Other server error — try next mirror
        console.warn(`[OSM Buildings] Server error ${response.status} on ${mirrorUrl}, trying next mirror`)
        continue
      } catch (error) {
        // DNS failure — mark this mirror as unreachable and skip it fast
        if (isDnsError(error)) {
          console.warn(`[OSM Buildings] DNS failed for ${mirrorUrl} — skipping this mirror`)
          dnsFailedMirrors.add(mirrorUrl)
          continue
        }

        // Timeout or other network error — try next mirror
        const isTimeout = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
        console.warn(`[OSM Buildings] ${isTimeout ? 'Timeout' : 'Error'} on ${mirrorUrl}:`, error instanceof Error ? error.message : error)
        continue
      }
    }
  }

  throw new Error('All Overpass API mirrors failed or are unreachable from this network')
}

/**
 * Convert Overpass API response to GeoJSON
 */
function overpassToGeoJSON(data: {
  elements: Array<{
    type: string
    id: number
    lat?: number
    lon?: number
    tags?: Record<string, string>
    nodes?: number[]
  }>
}): {
  type: string
  features: Array<{
    type: string
    id: string
    geometry: {
      type: string
      coordinates: number[][]
    }
    properties: Record<string, unknown>
  }>
} {
  const nodes = new Map<number, { lat: number; lon: number }>()
  data.elements
    .filter(el => el.type === 'node')
    .forEach(el => {
      if (el.lat !== undefined && el.lon !== undefined) {
        nodes.set(el.id, { lat: el.lat, lon: el.lon })
      }
    })

  const features = data.elements
    .filter(el => el.type === 'way' && el.tags?.building)
    .map(way => {
      const coords = (way.nodes || [])
        .map(nodeId => {
          const node = nodes.get(nodeId)
          return node ? [node.lon, node.lat] : null
        })
        .filter(Boolean) as number[][]

      if (coords.length > 0 && coords[0] !== coords[coords.length - 1]) {
        coords.push(coords[0])
      }

      const tags = way.tags || {}
      const height = parseHeight(tags.height, tags['building:levels'])

      return {
        type: 'Feature',
        id: `building-${way.id}`,
        geometry: {
          type: 'Polygon',
          coordinates: [coords],
        },
        properties: {
          id: way.id,
          building: tags.building || 'yes',
          name: tags.name || null,
          height: height,
          min_height: parseHeight(tags.min_height, null),
          levels: tags['building:levels'] ? parseInt(tags['building:levels']) : null,
          render_height: height,
          render_min_height: parseHeight(tags.min_height, null) || 0,
          class: classifyBuilding(tags),
        },
      }
    })

  return {
    type: 'FeatureCollection',
    features,
  }
}

function parseHeight(heightStr?: string, levelsStr?: string | null): number {
  if (heightStr) {
    const direct = parseFloat(heightStr)
    if (!isNaN(direct)) return direct

    const withUnit = heightStr.match(/^([\d.]+)\s*m/)
    if (withUnit) return parseFloat(withUnit[1])
  }

  if (levelsStr) {
    const levels = parseInt(levelsStr)
    if (!isNaN(levels)) return levels * 3
  }

  return 12
}

function classifyBuilding(tags: Record<string, string>): string {
  if (tags.building === 'residential' || tags.building === 'apartments') return 'residential'
  if (tags.building === 'commercial' || tags.building === 'retail') return 'commercial'
  if (tags.building === 'industrial') return 'industrial'
  if (tags.building === 'office') return 'office'
  if (tags.building === 'hospital') return 'hospital'
  if (tags.building === 'school' || tags.building === 'university') return 'education'
  if (tags.building === 'church' || tags.building === 'mosque' || tags.building === 'cathedral') return 'religious'
  return 'other'
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawBbox = searchParams.get('bbox')

    if (!rawBbox) {
      return NextResponse.json(
        { error: 'Missing required parameter: bbox (format: south,west,north,east)' },
        { status: 400 }
      )
    }

    const parts = rawBbox.split(',').map(Number)
    if (parts.length !== 4 || parts.some(isNaN)) {
      return NextResponse.json(
        { error: 'Invalid bbox format. Expected: south,west,north,east' },
        { status: 400 }
      )
    }

    const bbox = roundBbox(rawBbox)

    const cached = buildingCache.get(bbox)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=21600',
          'X-Cache': 'HIT',
        },
      })
    }

    const query = buildOverpassQuery(bbox)
    const response = await fetchFromOverpass(query)

    const overpassData = await response.json()
    const geojson = overpassToGeoJSON(overpassData)

    buildingCache.set(bbox, { data: geojson, timestamp: Date.now() })

    return NextResponse.json(geojson, {
      headers: {
        'Cache-Control': 'public, max-age=21600',
        'X-Cache': 'MISS',
        'X-Building-Count': geojson.features.length.toString(),
      },
    })

  } catch (error) {
    console.error('[OSM Buildings] Error:', error)

    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return NextResponse.json(
        { error: 'Overpass API request timed out' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Building data fetch failed' },
      { status: 504 }
    )
  }
}
