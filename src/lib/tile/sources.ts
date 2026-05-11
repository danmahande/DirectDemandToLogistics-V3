/**
 * Enhanced Tile Source Configuration (v9 — ESRI World Imagery as default)
 *
 * v9 FIXES over v8:
 * - Switched default satellite source to ESRI World Imagery (TRUE-COLOR, direct load)
 * - ESRI tiles have Access-Control-Allow-Origin: * headers, so they load
 *   DIRECTLY in the browser without needing a proxy server
 * - Google satellite REQUIRES proxy + DNS resolution of mt1.google.com,
 *   which is UNRELIABLE from Kampala networks (ENOTFOUND errors)
 * - ESRI World Imagery = true-color satellite imagery for Kampala
 *   (NOT to be confused with ESRI Clarity which shows infrared)
 * - crossOrigin:'anonymous' set on all raster sources for WebGL
 *
 * Architecture (rendered bottom-to-top):
 *   1. ESRI World Imagery (raster base — TRUE COLOR, direct load, CORS)
 *   2. OpenFreeMap Water (vector fill)
 *   3. OpenFreeMap Landuse (vector, subtle fill)
 *   4. Sky layer (atmospheric gradient)
 *   5. 3D Buildings — OpenFreeMap vector (fill-extrusion with render_height)
 *   6. 3D Buildings — OSM Overpass GeoJSON supplement (fill-extrusion)
 *   7. OpenFreeMap Roads (vector lines)
 *   8. Delivery route (geojson line)
 *   9. CARTO Labels (raster overlay, direct load, CORS)
 */

import type { StyleSpecification } from 'maplibre-gl'

// ============================================
// TILE SOURCE DEFINITIONS
// ============================================

/**
 * ESRI World Imagery — TRUE COLOR satellite tiles.
 *
 * WHY ESRI, not Google:
 * - ESRI ArcGIS Online returns Access-Control-Allow-Origin: * headers
 *   so tiles load DIRECTLY in the browser (no proxy needed, no timeouts)
 * - Google satellite (mt1.google.com) requires a server-side proxy,
 *   but DNS resolution of mt1.google.com is UNRELIABLE from Kampala
 *   networks, causing ENOTFOUND errors and tile proxy timeouts
 * - ESRI World Imagery is TRUE COLOR in Kampala (RGB satellite photos)
 * - NOT the same as ESRI Clarity which shows infrared/false-color
 *
 * Tile URL: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
 * CORS: Access-Control-Allow-Origin: * (verified)
 * Max zoom: 19
 */
const ESRI_WORLD_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/**
 * Google satellite tile URL template (requires proxy).
 *
 * WARNING: mt1.google.com DNS resolution is UNRELIABLE from Kampala.
 * Only use if your network can resolve Google hostnames.
 * Requires /api/tile/proxy for CORS bypass.
 */
const GOOGLE_SATELLITE_BASE = encodeURIComponent('https://mt1.google.com/vt/lyrs=s')
const GOOGLE_SATELLITE_PROXIED = `/api/tile/proxy?url=${GOOGLE_SATELLITE_BASE}%26x%3D{x}%26y%3D{y}%26z%3D{z}`

export const SATELLITE_SOURCES = {
  /** ESRI World Imagery — TRUE COLOR satellite, direct load with CORS (RECOMMENDED for Kampala) */
  esri: {
    id: 'esri-world',
    url: ESRI_WORLD_IMAGERY,
    maxzoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
    requiresProxy: false, // ESRI has CORS headers — loads directly
  },
  /** Google Maps Satellite — TRUE COLOR but requires proxy + DNS resolution of mt1.google.com */
  google: {
    id: 'google-satellite',
    url: GOOGLE_SATELLITE_PROXIED,
    maxzoom: 20,
    attribution: 'Google Maps',
    requiresProxy: true, // Google blocks direct browser access — needs proxy
  },
} as const

export const VECTOR_SOURCES = {
  /** OpenFreeMap planet vector tiles — buildings with render_height, roads, water, landuse */
  openfreemap: {
    id: 'openfreemap',
    url: 'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf',
    maxzoom: 14,
    attribution: 'OpenFreeMap, OpenMapTiles, OpenStreetMap',
  },
} as const

export const LABEL_SOURCES = {
  light: {
    id: 'carto-light-labels',
    url: 'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
    maxzoom: 19,
    attribution: 'CARTO',
  },
  dark: {
    id: 'carto-dark-labels',
    url: 'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
    maxzoom: 19,
    attribution: 'CARTO',
  },
} as const

export const MAP_2D_SOURCES = {
  voyager: {
    id: 'carto-voyager',
    url: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
    maxzoom: 19,
    attribution: 'CARTO, OpenStreetMap',
  },
  positron: {
    id: 'carto-positron',
    url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
    maxzoom: 19,
    attribution: 'CARTO, OpenStreetMap',
  },
  darkMatter: {
    id: 'carto-dark-matter',
    url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
    maxzoom: 19,
    attribution: 'CARTO, OpenStreetMap',
  },
} as const

// ============================================
// STYLE CONFIGURATION TYPES
// ============================================

export interface MapStyleConfig {
  nightMode: boolean
  buildingHeightExaggeration: number
  showBuildings: boolean
  showRoads: boolean
  showWater: boolean
  showLabels: boolean
  showSatellite: boolean
  showSky: boolean
  buildingOpacity: number
  satelliteOpacity: number
  roadOpacity: number
  labelOpacity: number
  /** Which satellite source: 'esri' (recommended, direct CORS) or 'google' (needs proxy) */
  satelliteSource: 'esri' | 'google'
}

export const DEFAULT_MAP_CONFIG: MapStyleConfig = {
  nightMode: false,
  buildingHeightExaggeration: 2.0,
  showBuildings: true,
  showRoads: true,
  showWater: true,
  showLabels: true,
  showSatellite: true,
  showSky: true,
  buildingOpacity: 0.88,
  satelliteOpacity: 1.0,
  roadOpacity: 0.85,
  labelOpacity: 0.7,
  satelliteSource: 'esri',  // v9: ESRI World Imagery — reliable from Kampala, direct CORS
}

// ============================================
// HELPER: Get satellite source by config
// ============================================

function getSatelliteSource(source: MapStyleConfig['satelliteSource']) {
  switch (source) {
    case 'google': return SATELLITE_SOURCES.google
    case 'esri':
    default: return SATELLITE_SOURCES.esri
  }
}

export function getLabelSource(nightMode: boolean) {
  return nightMode ? LABEL_SOURCES.dark : LABEL_SOURCES.light
}

// ============================================
// ENHANCED MAPLIBRE STYLE BUILDER
// ============================================

/**
 * Build the complete MapLibre style object for the 3D map.
 *
 * v9: ESRI World Imagery as default — loads directly with CORS, no proxy.
 * crossOrigin:'anonymous' set on all raster sources for WebGL compatibility.
 */
export function build3DMapStyle(config: Partial<MapStyleConfig> = {}): StyleSpecification {
  const c = { ...DEFAULT_MAP_CONFIG, ...config }
  const satSource = getSatelliteSource(c.satelliteSource)
  const heightMultiplier = c.buildingHeightExaggeration

  return {
    version: 8 as const,
    sources: {
      // Base satellite imagery — ESRI World Imagery (direct, CORS) or Google (proxied)
      'satellite': {
        type: 'raster' as const,
        tiles: [satSource.url],
        tileSize: 256,
        maxzoom: satSource.maxzoom,
        attribution: satSource.attribution,
        // crossOrigin='anonymous' required for WebGL texture rendering.
        // ESRI returns Access-Control-Allow-Origin: * so this works directly.
        // Google proxied tiles also have CORS headers from our proxy.
        crossOrigin: 'anonymous' as const,
      },
      // OpenFreeMap vector tiles for buildings, roads, water
      'openmaptiles': {
        type: 'vector',
        tiles: [VECTOR_SOURCES.openfreemap.url],
        maxzoom: VECTOR_SOURCES.openfreemap.maxzoom,
        attribution: VECTOR_SOURCES.openfreemap.attribution,
      },
      // Label overlay — CARTO has CORS headers, loads directly
      'labels': {
        type: 'raster' as const,
        tiles: [getLabelSource(c.nightMode).url],
        tileSize: 256,
        maxzoom: 19,
        crossOrigin: 'anonymous' as const,
      },
    },
    // Sky layer for atmospheric rendering
    sky: c.showSky ? {
      'sky-color': c.nightMode ? '#0a0a1a' : '#88bbee',
      'horizon-color': c.nightMode ? '#1a1a2e' : '#b8d4e8',
      'fog-color': c.nightMode ? '#1a1a2e' : '#c8dce8',
      'fog-ground-blend': 0.9,
      'horizon-fog-blend': 0.4,
      'sky-horizon-blend': 0.6,
      'atmosphere-blend': c.nightMode
        ? ['interpolate', ['linear'], ['zoom'], 0, 0.3, 14, 0.1, 18, 0.05]
        : ['interpolate', ['linear'], ['zoom'], 0, 0.5, 14, 0.3, 18, 0.15],
    } : undefined,
    // Light configuration for 3D building rendering
    light: {
      anchor: 'viewport',
      color: c.nightMode ? '#334466' : '#ffffff',
      intensity: c.nightMode ? 0.4 : 0.6,
      position: c.nightMode
        ? [1.15, 210, 30]
        : [1.15, 90, 30],
    },
    layers: [
      // 1. Satellite base
      ...(c.showSatellite ? [{
        id: 'satellite-layer',
        type: 'raster' as const,
        source: 'satellite',
        minzoom: 0,
        maxzoom: 20,
        paint: {
          'raster-opacity': c.satelliteOpacity,
          'raster-brightness-max': c.nightMode ? 0.6 : 1.0,
          'raster-saturation': c.nightMode ? 0.3 : 1.0,
        },
      }] : []),

      // 2. Water features
      ...(c.showWater ? [{
        id: 'water',
        type: 'fill' as const,
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: {
          'fill-color': c.nightMode ? '#0a1628' : '#7cb5d4',
          'fill-opacity': 0.7,
        },
      }] : []),

      // 3. Landuse — subtle fills for urban areas
      {
        id: 'landuse',
        type: 'fill' as const,
        source: 'openmaptiles',
        'source-layer': 'landuse',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filter: ['in', 'class', 'residential', 'suburban', 'neighbourhood'] as any,
        paint: {
          'fill-color': c.nightMode ? '#1a1a2e' : '#d4e6d4',
          'fill-opacity': c.nightMode ? 0.2 : 0.12,
        },
      },

      // 4. 3D Buildings
      ...(c.showBuildings ? [
        {
          id: '3d-buildings',
          type: 'fill-extrusion' as const,
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 11,
          paint: {
            'fill-extrusion-color': c.nightMode
              ? [
                  'interpolate', ['linear'], ['get', 'render_height'],
                  0, '#4a6fa5',
                  10, '#5b82b8',
                  20, '#6c95cb',
                  40, '#7da8de',
                  60, '#8ebbef',
                  80, '#9fcfff',
                  100, '#b0e0ff',
                ]
              : [
                  'interpolate', ['linear'], ['get', 'render_height'],
                  0, '#e8a838',
                  10, '#e0922e',
                  20, '#d87c24',
                  40, '#c46820',
                  60, '#b0541c',
                  80, '#9c4018',
                  100, '#882c14',
                ],
            'fill-extrusion-height': [
              '*',
              ['coalesce', ['get', 'render_height'], 12],
              heightMultiplier,
            ],
            'fill-extrusion-base': [
              '*',
              ['coalesce', ['get', 'render_min_height'], 0],
              heightMultiplier,
            ],
            'fill-extrusion-opacity': c.buildingOpacity,
          },
        },
        {
          id: 'building-outline',
          type: 'line' as const,
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'line-color': c.nightMode ? '#5a5a7a' : '#ffffff',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              14, 0.4,
              16, 1.0,
              18, 2.0,
            ],
            'line-opacity': 0.5,
          },
        },
      ] : []),

      // 5. Road network
      ...(c.showRoads ? [
        {
          id: 'road-major-casing',
          type: 'line' as const,
          source: 'openmaptiles',
          'source-layer': 'transportation',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filter: ['in', 'class', 'primary', 'trunk', 'motorway'] as any,
          paint: {
            'line-color': c.nightMode ? '#1a1a2e' : '#ffffff',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 1,
              12, 2,
              14, 5,
              16, 10,
              18, 18,
            ],
            'line-opacity': 0.6,
          },
        },
        {
          id: 'road-major',
          type: 'line' as const,
          source: 'openmaptiles',
          'source-layer': 'transportation',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filter: ['in', 'class', 'primary', 'trunk', 'motorway'] as any,
          paint: {
            'line-color': c.nightMode ? '#4a4a60' : '#f0e68c',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.5,
              12, 1,
              14, 3,
              16, 6,
              18, 12,
            ],
            'line-opacity': c.roadOpacity,
          },
        },
        {
          id: 'road-secondary',
          type: 'line' as const,
          source: 'openmaptiles',
          'source-layer': 'transportation',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filter: ['in', 'class', 'secondary', 'tertiary'] as any,
          paint: {
            'line-color': c.nightMode ? '#3a3a50' : '#ffffff',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              12, 0.5,
              14, 2,
              16, 4,
              18, 8,
            ],
            'line-opacity': c.roadOpacity * 0.9,
          },
        },
        {
          id: 'road-minor',
          type: 'line' as const,
          source: 'openmaptiles',
          'source-layer': 'transportation',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filter: ['in', 'class', 'minor', 'service', 'path', 'track'] as any,
          paint: {
            'line-color': c.nightMode ? '#2a2a3e' : '#e0e0e0',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              14, 0.3,
              16, 1.5,
              18, 3,
            ],
            'line-opacity': 0.5,
          },
        },
      ] : []),

      // 6. Label overlay
      ...(c.showLabels ? [{
        id: 'labels-layer',
        type: 'raster' as const,
        source: 'labels',
        minzoom: 10,
        maxzoom: 19,
        paint: {
          'raster-opacity': c.labelOpacity,
        },
      }] : []),
    ].filter(Boolean),
  } as StyleSpecification
}

// ============================================
// OSM BUILDINGS GEOJSON LOADER
// ============================================

/**
 * Fetch building GeoJSON from the OSM Overpass API route.
 *
 * The server-side route handles Overpass mirror failover.
 * Client timeout is generous since Overpass can be slow.
 */
export async function fetchOSMBuildings(
  bounds: { south: number; west: number; north: number; east: number }
): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
    const response = await fetch(`/api/osm/buildings?bbox=${bbox}`, {
      signal: AbortSignal.timeout(60000), // 60s — server handles Overpass failover
    })

    if (!response.ok) {
      console.error(`[OSM Buildings] Fetch failed: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json()
    console.log(`[OSM Buildings] Loaded ${data.features?.length || 0} buildings from Overpass API`)
    return data
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error('[OSM Buildings] Request timed out after 60s.')
    } else {
      console.error('[OSM Buildings] Fetch error:', error)
    }
    return null
  }
}

/**
 * Add OSM Overpass building data as a supplementary GeoJSON layer on the map.
 */
export function addOSMBuildingLayer(
  map: maplibregl.Map,
  geojson: GeoJSON.FeatureCollection,
  config: Partial<MapStyleConfig> = {}
): void {
  const c = { ...DEFAULT_MAP_CONFIG, ...config }

  // Remove existing OSM buildings layer/source if present
  if (map.getLayer('osm-buildings-3d')) map.removeLayer('osm-buildings-3d')
  if (map.getLayer('osm-building-outline')) map.removeLayer('osm-building-outline')
  if (map.getSource('osm-buildings')) map.removeSource('osm-buildings')

  // Add GeoJSON source
  map.addSource('osm-buildings', {
    type: 'geojson',
    data: geojson as any,
  })

  // Add 3D extrusion layer
  map.addLayer({
    id: 'osm-buildings-3d',
    type: 'fill-extrusion',
    source: 'osm-buildings',
    minzoom: 11,
    paint: {
      'fill-extrusion-color': c.nightMode
        ? [
            'interpolate', ['linear'], ['get', 'render_height'],
            0, '#4a6fa5',
            10, '#5b82b8',
            20, '#6c95cb',
            40, '#7da8de',
            60, '#8ebbef',
            100, '#b0e0ff',
          ]
        : [
            'interpolate', ['linear'], ['get', 'render_height'],
            0, '#e8a838',
            10, '#e0922e',
            20, '#d87c24',
            40, '#c46820',
            60, '#b0541c',
            80, '#9c4018',
            100, '#882c14',
          ],
      'fill-extrusion-height': [
        '*',
        ['coalesce', ['get', 'render_height'], 12],
        c.buildingHeightExaggeration,
      ],
      'fill-extrusion-base': [
        '*',
        ['coalesce', ['get', 'render_min_height'], 0],
        c.buildingHeightExaggeration,
      ],
      'fill-extrusion-opacity': c.buildingOpacity,
    },
  })

  // Add outline for OSM buildings
  map.addLayer({
    id: 'osm-building-outline',
    type: 'line',
    source: 'osm-buildings',
    minzoom: 14,
    paint: {
      'line-color': c.nightMode ? '#5a5a7a' : '#ffffff',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        14, 0.3,
        16, 0.8,
        18, 1.5,
      ],
      'line-opacity': 0.4,
    },
  })
}

// ============================================
// KAMPALA-SPECIFIC MAP DEFAULTS
// ============================================

export const KAMPALA_CENTER: [number, number] = [32.5814, 0.3152]

export const DEFAULT_3D_CAMERA = {
  center: KAMPALA_CENTER,
  zoom: 14.5,
  pitch: 55,
  bearing: -20,
  maxPitch: 85,
  minZoom: 10,
  maxZoom: 18,
} as const

export const NAVIGATION_CAMERA = {
  center: KAMPALA_CENTER,
  zoom: 16,
  pitch: 70,
  bearing: 0,
  maxPitch: 85,
  minZoom: 14,
  maxZoom: 18,
} as const

export const KAMPALA_BOUNDS: [[number, number], [number, number]] = [
  [32.44, 0.22],
  [32.72, 0.42],
]
