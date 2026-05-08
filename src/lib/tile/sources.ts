/**
 * Enhanced Tile Source Configuration (v6 — FIXED for Kampala)
 *
 * KEY FIXES over v5:
 * - Switched default satellite from ESRI to Google Maps (true-color for Kampala)
 * - ESRI still available as fallback option
 * - Increased building default height from 5m to 12m
 * - Increased building height exaggeration default from 1.0 to 2.0
 * - Changed building colors from muted gray to vibrant, high-contrast colors
 * - Lowered building minzoom from 13 to 11
 * - Increased building opacity from 0.75 to 0.88
 * - Added OSM Overpass GeoJSON building source as supplement
 * - Added Google satellite as primary source (proven true-color globally)
 *
 * Architecture (rendered bottom-to-top):
 *   1. Google Satellite (raster base — TRUE COLOR)
 *   2. OpenFreeMap Water (vector fill)
 *   3. OpenFreeMap Landuse (vector, subtle fill)
 *   4. Sky layer (atmospheric gradient)
 *   5. 3D Buildings — OpenFreeMap vector (fill-extrusion with render_height)
 *   6. 3D Buildings — OSM Overpass GeoJSON supplement (fill-extrusion)
 *   7. OpenFreeMap Roads (vector lines)
 *   8. Delivery route (geojson line)
 *   9. CARTO Labels (raster overlay)
 */

import type { StyleSpecification } from 'maplibre-gl'

// ============================================
// TILE SOURCE DEFINITIONS
// ============================================

export const SATELLITE_SOURCES = {
  /** Google Maps Satellite — TRUE COLOR, high-res globally, free for limited use */
  google: {
    id: 'google-satellite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    maxzoom: 20,
    attribution: 'Google Maps',
  },
  /** ESRI World Imagery — may show infrared for some African regions */
  esri: {
    id: 'esri-world',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxzoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  /** ESRI Clarity — sharper contrast but KNOWN to show infrared in Kampala */
  esriClarity: {
    id: 'esri-clarity',
    url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxzoom: 19,
    attribution: 'Esri',
  },
} as const

export const VECTOR_SOURCES = {
  /** OpenFreeMap planet vector tiles — buildings with render_height, roads, water, landuse */
  openfreemap: {
    id: 'openfreemap',
    url: 'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf',
    maxzoom: 14, // OpenFreeMap max detail zoom; MapLibre overzooms beyond this
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
  buildingHeightExaggeration: number  // 1.0 = real, 2.0 = double height
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
  /** Which satellite source to use: 'google' (true-color), 'esri', or 'esriClarity' */
  satelliteSource: 'google' | 'esri' | 'esriClarity'
}

export const DEFAULT_MAP_CONFIG: MapStyleConfig = {
  nightMode: false,
  buildingHeightExaggeration: 2.0,     // FIXED: was 1.0, now 2.0 for Kampala where height data is sparse
  showBuildings: true,
  showRoads: true,
  showWater: true,
  showLabels: true,
  showSatellite: true,
  showSky: true,
  buildingOpacity: 0.88,               // FIXED: was 0.75, now 0.88 for better visibility
  satelliteOpacity: 1.0,
  roadOpacity: 0.85,
  labelOpacity: 0.7,
  satelliteSource: 'google',            // FIXED: was esri (shows infrared), now google (true-color)
}

// ============================================
// HELPER: Get satellite source by config
// ============================================

function getSatelliteSource(source: MapStyleConfig['satelliteSource']) {
  switch (source) {
    case 'google': return SATELLITE_SOURCES.google
    case 'esri': return SATELLITE_SOURCES.esri
    case 'esriClarity': return SATELLITE_SOURCES.esriClarity
    default: return SATELLITE_SOURCES.google
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
 * FIXED: Google satellite for true-color imagery in Kampala.
 * FIXED: Building colors changed from muted gray to vibrant high-contrast colors.
 * FIXED: Building height exaggeration default 2.0 for sparse height data.
 * FIXED: Building minzoom lowered from 13 to 11.
 * FIXED: Building fallback height from 5m to 12m.
 */
export function build3DMapStyle(config: Partial<MapStyleConfig> = {}): StyleSpecification {
  const c = { ...DEFAULT_MAP_CONFIG, ...config }
  const satSource = getSatelliteSource(c.satelliteSource)
  const heightMultiplier = c.buildingHeightExaggeration

  return {
    version: 8 as const,
    sources: {
      // Base satellite imagery — FIXED: Google for true-color
      'satellite': {
        type: 'raster' as const,
        tiles: [satSource.url],
        tileSize: 256,
        maxzoom: satSource.maxzoom,
        attribution: satSource.attribution,
      },
      // OpenFreeMap vector tiles for buildings, roads, water
      'openmaptiles': {
        type: 'vector',
        tiles: [VECTOR_SOURCES.openfreemap.url],
        maxzoom: VECTOR_SOURCES.openfreemap.maxzoom,
        attribution: VECTOR_SOURCES.openfreemap.attribution,
      },
      // Label overlay
      'labels': {
        type: 'raster' as const,
        tiles: [getLabelSource(c.nightMode).url],
        tileSize: 256,
        maxzoom: 19,
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
        ? [1.15, 210, 30]  // Moonlight from southwest
        : [1.15, 90, 30],   // Sunlight from east (morning in Kampala)
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

      // 4. 3D Buildings — FIXED: vibrant colors, lower minzoom, higher default height
      ...(c.showBuildings ? [
        {
          id: '3d-buildings',
          type: 'fill-extrusion' as const,
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 11,                      // FIXED: was 13, now 11 for earlier visibility
          paint: {
            // FIXED: Changed from muted gray to VIBRANT, high-contrast colors
            // that stand out clearly against satellite imagery
            'fill-extrusion-color': c.nightMode
              ? [
                  'interpolate', ['linear'], ['get', 'render_height'],
                  0, '#4a6fa5',      // Deep blue — ground/short
                  10, '#5b82b8',     // Medium blue
                  20, '#6c95cb',     // Blue
                  40, '#7da8de',     // Light blue
                  60, '#8ebbef',     // Bright blue
                  80, '#9fcfff',     // Sky blue
                  100, '#b0e0ff',    // Ice blue — tall/skyscraper
                ]
              : [
                  'interpolate', ['linear'], ['get', 'render_height'],
                  0, '#e8a838',      // Warm orange — ground/short (HIGHEST CONTRAST vs green satellite)
                  10, '#e0922e',     // Deep orange
                  20, '#d87c24',     // Burnt orange
                  40, '#c46820',     // Rust
                  60, '#b0541c',     // Brown-orange
                  80, '#9c4018',     // Deep brown
                  100, '#882c14',    // Dark mahogany — tall/skyscraper
                ],
            // FIXED: Height fallback from 5m to 12m for Kampala sparse data
            'fill-extrusion-height': [
              '*',
              ['coalesce', ['get', 'render_height'], 12],   // FIXED: was 5, now 12
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
        // Building outline layer for better definition
        {
          id: 'building-outline',
          type: 'line' as const,
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14,                      // Lowered from 15 to 14
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
        // Major roads (primary, trunk)
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
        // Secondary & tertiary roads
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
        // Minor roads
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
 * This supplements the OpenFreeMap vector tile buildings with
 * potentially more complete data for Kampala.
 */
export async function fetchOSMBuildings(
  bounds: { south: number; west: number; north: number; east: number }
): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
    const response = await fetch(`/api/osm/buildings?bbox=${bbox}`, {
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      console.warn('[OSM Buildings] Fetch failed:', response.status)
      return null
    }

    const data = await response.json()
    console.log(`[OSM Buildings] Loaded ${data.features?.length || 0} buildings from Overpass API`)
    return data
  } catch (error) {
    console.warn('[OSM Buildings] Error:', error)
    return null
  }
}

/**
 * Add OSM Overpass building data as a supplementary GeoJSON layer on the map.
 * This ensures buildings are visible even if OpenFreeMap tiles are sparse.
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

  // Add 3D extrusion layer — same vibrant colors as vector tile buildings
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

/** Default center on Nakasero Market, Kampala */
export const KAMPALA_CENTER: [number, number] = [32.5814, 0.3152] // [lng, lat]

/** Default map camera settings for 3D view */
export const DEFAULT_3D_CAMERA = {
  center: KAMPALA_CENTER,
  zoom: 14.5,
  pitch: 55,
  bearing: -20,
  maxPitch: 85,
  minZoom: 10,
  maxZoom: 18,
} as const

/** Default map camera settings for navigation view */
export const NAVIGATION_CAMERA = {
  center: KAMPALA_CENTER,
  zoom: 16,
  pitch: 70,
  bearing: 0,
  maxPitch: 85,
  minZoom: 14,
  maxZoom: 18,
} as const

/** Kampala bounding box for restricting map view */
export const KAMPALA_BOUNDS: [[number, number], [number, number]] = [
  [32.44, 0.22],  // SW corner [lng, lat]
  [32.72, 0.42],  // NE corner [lng, lat]
]
