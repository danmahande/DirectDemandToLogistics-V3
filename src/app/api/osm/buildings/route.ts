import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════
// OSM BUILDINGS API (v6 — FIXED)
// ═══════════════════════════════════════════════════════════
// Fetches building data from OpenStreetMap Overpass API
// for a given bounding box around Kampala.
//
// Usage: GET /api/osm/buildings?bbox=south,west,north,east
//
// Returns: GeoJSON FeatureCollection of buildings with height data
// ═══════════════════════════════════════════════════════════

const OVERPASS_API = 'https://overpass-api.de/api/interpreter'
const CACHE_DURATION = 6 * 60 * 60 * 1000 // 6 hours (buildings don't change often)

interface BuildingCacheEntry {
  data: unknown
  timestamp: number
}

const buildingCache = new Map<string, BuildingCacheEntry>()

/**
 * Build Overpass QL query for buildings in a bounding box
 */
function buildOverpassQuery(bbox: string): string {
  // bbox format: south,west,north,east (lat,lng)
  return `
[out:json][timeout:25];
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
 * Accepts formats: "15", "15 m", "15m", "5 stories"
 */
function parseHeight(heightStr?: string, levelsStr?: string | null): number {
  if (heightStr) {
    // Try direct number
    const direct = parseFloat(heightStr)
    if (!isNaN(direct)) return direct

    // Try "15 m" or "15m" format
    const withUnit = heightStr.match(/^([\d.]+)\s*m/)
    if (withUnit) return parseFloat(withUnit[1])
  }

  // Estimate from levels (3m per level)
  if (levelsStr) {
    const levels = parseInt(levelsStr)
    if (!isNaN(levels)) return levels * 3
  }

  // FIXED: Default height for unmapped buildings changed from 5m to 12m
  // to match the coalesce default in sources.ts build3DMapStyle()
  return 12
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
    const bbox = searchParams.get('bbox')

    if (!bbox) {
      return NextResponse.json(
        { error: 'Missing required parameter: bbox (format: south,west,north,east)' },
        { status: 400 }
      )
    }

    // Validate bbox format
    const parts = bbox.split(',').map(Number)
    if (parts.length !== 4 || parts.some(isNaN)) {
      return NextResponse.json(
        { error: 'Invalid bbox format. Expected: south,west,north,east' },
        { status: 400 }
      )
    }

    // Check cache
    const cacheKey = bbox
    const cached = buildingCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=21600',
          'X-Cache': 'HIT',
        },
      })
    }

    // Query Overpass API
    const query = buildOverpassQuery(bbox)
    const response = await fetch(OVERPASS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'DirectDDL/6.0',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(25000),
    })

    if (!response.ok) {
      console.error('[OSM Buildings] Overpass API error:', response.status)
      return NextResponse.json(
        { error: 'Overpass API request failed', status: response.status },
        { status: response.status }
      )
    }

    const overpassData = await response.json()
    const geojson = overpassToGeoJSON(overpassData)

    // Cache result
    buildingCache.set(cacheKey, { data: geojson, timestamp: Date.now() })

    return NextResponse.json(geojson, {
      headers: {
        'Cache-Control': 'public, max-age=21600',
        'X-Cache': 'MISS',
        'X-Building-Count': geojson.features.length.toString(),
      },
    })

  } catch (error) {
    console.error('[OSM Buildings] Error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Overpass API request timed out' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: 'Building data fetch failed' },
      { status: 500 }
    )
  }
}
