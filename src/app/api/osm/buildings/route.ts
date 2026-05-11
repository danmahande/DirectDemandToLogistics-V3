import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════
// OSM BUILDINGS API (v7 — OVERPASS FAILOVER)
// ═══════════════════════════════════════════════════════════
// Fetches building data from OpenStreetMap Overpass API
// for a given bounding box around Kampala.
//
// Usage: GET /api/osm/buildings?bbox=south,west,north,east
//
// Returns: GeoJSON FeatureCollection of buildings with height data
//
// v7 FIXES:
// - Multiple Overpass API mirrors with automatic failover
// - Retry with backoff on 429 (rate limit) responses
// - Rounded bbox for better cache hit rate
// - Longer timeout (30s) to match Overpass query timeout
// ═══════════════════════════════════════════════════════════

// Multiple Overpass API endpoints — try each in order on failure
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const CACHE_DURATION = 6 * 60 * 60 * 1000 // 6 hours (buildings don't change often)

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
 * Try fetching from Overpass API with mirror failover and 429 retry.
 */
async function fetchFromOverpass(query: string): Promise<Response> {
  const maxRetries = 2 // retry each mirror up to 2 times on 429
  const retryDelay = 3000 // wait 3s before retrying on 429

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (const mirrorUrl of OVERPASS_MIRRORS) {
      try {
        const response = await fetch(mirrorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'DirectDDL/7.0 (Kampala Logistics)',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(30000), // 30s timeout — Overpass query timeout is 30s
        })

        // Success — return the response
        if (response.ok) {
          return response
        }

        // 429 rate limit — wait and retry this mirror once, then try next
        if (response.status === 429) {
          console.warn(`[OSM Buildings] Rate limited (429) on ${mirrorUrl}, attempt ${attempt + 1}/${maxRetries}`)
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            continue
          }
          continue // try next mirror
        }

        // Other server error — try next mirror
        console.warn(`[OSM Buildings] Server error ${response.status} on ${mirrorUrl}, trying next mirror`)
        continue
      } catch (error) {
        // Timeout or network error — try next mirror
        console.warn(`[OSM Buildings] Error on ${mirrorUrl}:`, error instanceof Error ? error.message : error)
        continue
      }
    }
  }

  // All mirrors failed
  throw new Error('All Overpass API mirrors failed')
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
  // Build node lookup for ways
  const nodes = new Map<number, { lat: number; lon: number }>()
  data.elements
    .filter(el => el.type === 'node')
    .forEach(el => {
      if (el.lat !== undefined && el.lon !== undefined) {
        nodes.set(el.id, { lat: el.lat, lon: el.lon })
      }
    })

  // Convert ways to GeoJSON features
  const features = data.elements
    .filter(el => el.type === 'way' && el.tags?.building)
    .map(way => {
      const coords = (way.nodes || [])
        .map(nodeId => {
          const node = nodes.get(nodeId)
          return node ? [node.lon, node.lat] : null
        })
        .filter(Boolean) as number[][]

      // Close the polygon if not already closed
      if (coords.length > 0 && coords[0] !== coords[coords.length - 1]) {
        coords.push(coords[0])
      }

      // Parse height data
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

/**
 * Parse height from OSM tags
 */
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

  return 12 // Default height for unmapped buildings
}

/**
 * Classify building type for styling
 */
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

    // Validate bbox format
    const parts = rawBbox.split(',').map(Number)
    if (parts.length !== 4 || parts.some(isNaN)) {
      return NextResponse.json(
        { error: 'Invalid bbox format. Expected: south,west,north,east' },
        { status: 400 }
      )
    }

    // Round bbox for better cache hits
    const bbox = roundBbox(rawBbox)

    // Check cache
    const cached = buildingCache.get(bbox)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=21600',
          'X-Cache': 'HIT',
        },
      })
    }

    // Query Overpass API with mirror failover
    const query = buildOverpassQuery(bbox)
    const response = await fetchFromOverpass(query)

    const overpassData = await response.json()
    const geojson = overpassToGeoJSON(overpassData)

    // Cache result
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
        { error: 'Overpass API request timed out. All mirrors were tried.' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: 'Building data fetch failed. All Overpass API mirrors were tried.' },
      { status: 504 }
    )
  }
}
