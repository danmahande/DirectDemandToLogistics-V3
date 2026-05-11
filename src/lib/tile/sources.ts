/**
 * Enhanced Tile Source Configuration (v10 — ALL TILES PROXIED)
 *
 * v10 FIXES over v9:
 * - ALL external tiles routed through /api/tile/proxy
 *   (browser can't reach external URLs from Kampala network)
 * - ESRI satellite tiles through proxy
 * - CARTO label tiles through proxy
 * - Removed crossOrigin (not needed for same-origin proxy requests)
 * - Browser ONLY talks to localhost:3000 (the Next.js server)
 * - Server fetches external tiles and serves them locally
 *
 * Why proxy EVERYTHING:
 * - Browser at localhost:3000 cannot reach external URLs
 *   (AJAXError: Failed to fetch (0) for ESRI, CARTO, Google)
 * - But the Next.js server CAN reach external services
 *   (Google tiles returned 200 through proxy in earlier sessions)
 * - Proxy runs on same machine = no network barrier
 * - Proxy adds CORS headers + caching
 *
 * Architecture:
 *   Browser → localhost:3000/api/tile/proxy → External tile servers
 */

import type { StyleSpecification } from 'maplibre-gl'

// ============================================
// PROXIED TILE URL BUILDERS
// ============================================
// All external tile URLs go through /api/tile/proxy so the browser
// never makes direct requests to external servers.
//
// URL construction:
//   1. Encode the base URL (everything before {z}/{x}/{y})
//   2. Keep {z},{x},{y} as unencoded literals for MapLibre substitution
//   3. After substitution, server decodes the url param and fetches

// --- ESRI World Imagery (TRUE COLOR satellite) ---
// Verified: server.arcgisonline.com has Access-Control-Allow-Origin: *
// Direct browser access fails from Kampala networks → must proxy
const ESRI_BASE = encodeURIComponent('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile')
const ESRI_PROXIED = `/api/tile/proxy?url=${ESRI_BASE}%2F{z}%2F{y}%2F{x}`

// --- Google Satellite (TRUE COLOR, needs proxy for CORS bypass) ---
const GOOGLE_SATELLITE_BASE = encodeURIComponent('https://mt1.google.com/vt/lyrs=s')
const GOOGLE_SATELLITE_PROXIED = `/api/tile/proxy?url=${GOOGLE_SATELLITE_BASE}%26x%3D{x}%26y%3D{y}%26z%3D{z}`

// --- CARTO Labels (both light and dark) ---
const CARTO_LIGHT_BASE = encodeURIComponent('https://a.basemaps.cartocdn.com/light_only_labels')
const CARTO_DARK_BASE = encodeURIComponent('https://a.basemaps.cartocdn.com/dark_only_labels')
const CARTO_LIGHT_PROXIED = `/api/tile/proxy?url=${CARTO_LIGHT_BASE}%2F{z}%2F{x}%2F{y}%402x.png`
const CARTO_DARK_PROXIED = `/api/tile/proxy?url=${CARTO_DARK_BASE}%2F{z}%2F{x}%2F{y}%402x.png`

// ============================================
// TILE SOURCE DEFINITIONS
// ============================================

export const SATELLITE_SOURCES = {
  /** ESRI World Imagery — TRUE COLOR satellite, proxied */
  esri: {
    id: 'esri-world',
    url: ESRI_PROXIED,
    maxzoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  /** Google Maps Satellite — TRUE COLOR but DNS may fail from Kampala */
  google: {
    id: 'google-satellite',
    url: GOOGLE_SATELLITE_PROXIED,
    maxzoom: 20,
    attribution: 'Google Maps',
  },
} as const

export const VECTOR_SOURCES = {
  /** OpenFreeMap planet vector tiles — buildings, roads, water, landuse */
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
    url: CARTO_LIGHT_PROXIED,
    maxzoom: 19,
    attribution: 'CARTO',
  },
  dark: {
    id: 'carto-dark-labels',
    url: CARTO_DARK_PROXIED,
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
  /** Which satellite source: 'esri' (recommended) or 'google' (DNS may fail) */
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
  satelliteSource: 'esri',  // ESRI World Imagery — true-color, proxied
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

export function build3DMapStyle(config: Partial<MapStyleConfig> = {}): StyleSpecification {
  const c = { ...DEFAULT_MAP_CONFIG, ...config }
  const satSource = getSatelliteSource(c.satelliteSource)
  const heightMultiplier = c.buildingHeightExaggeration

  return {
    version: 8 as const,
    sources: {
      // Satellite imagery — proxied through /api/tile/proxy
      'satellite': {
        type: 'raster' as const,
        tiles: [satSource.url],
        tileSize: 256,
        maxzoom: satSource.maxzoom,
        attribution: satSource.attribution,
        // No crossOrigin needed — proxy is same-origin (localhost)
      },
      // OpenFreeMap vector tiles for buildings, roads, water
      'openmaptiles': {
        type: 'vector',
        tiles: [VECTOR_SOURCES.openfreemap.url],
        maxzoom: VECTOR_SOURCES.openfreemap.maxzoom,
        attribution: VECTOR_SOURCES.openfreemap.attribution,
      },
      // Label overlay — proxied through /api/tile/proxy
      'labels': {
        type: 'raster' as const,
        tiles: [getLabelSource(c.nightMode).url],
        tileSize: 256,
        maxzoom: 19,
        // No crossOrigin needed — proxy is same-origin (localhost)
      },
    },
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

      // 3. Landuse
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

export async function fetchOSMBuildings(
  bounds: { south: number; west: number; north: number; east: number }
): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
    const response = await fetch(`/api/osm/buildings?bbox=${bbox}`, {
      signal: AbortSignal.timeout(60000),
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

export function addOSMBuildingLayer(
  map: maplibregl.Map,
  geojson: GeoJSON.FeatureCollection,
  config: Partial<MapStyleConfig> = {}
): void {
  const c = { ...DEFAULT_MAP_CONFIG, ...config }

  if (map.getLayer('osm-buildings-3d')) map.removeLayer('osm-buildings-3d')
  if (map.getLayer('osm-building-outline')) map.removeLayer('osm-building-outline')
  if (map.getSource('osm-buildings')) map.removeSource('osm-buildings')

  map.addSource('osm-buildings', {
    type: 'geojson',
    data: geojson as any,
  })

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
