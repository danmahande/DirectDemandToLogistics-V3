/**
 * Enhanced Tile Source Configuration (v5 — NEW)
 *
 * Production-grade tile sources for the 3D logistics dashboard.
 * Only free, no-API-key-required, battle-tested sources.
 *
 * NEW Features over v4:
 * - Sky layer configuration for atmospheric rendering
 * - Light positioning for realistic building shadows
 * - Terrain source configuration (ready for future elevation data)
 * - Enhanced building color gradients with glass-like effects
 * - Building height exaggeration multiplier
 * - Separate layer groupings for independent toggle control
 * - Kampala-specific optimizations (zoom levels, source-layer filters)
 *
 * Architecture (rendered bottom-to-top):
 *   1. ESRI Satellite (raster base)
 *   2. OpenFreeMap Water (vector fill)
 *   3. OpenFreeMap Landuse (vector, subtle fill)
 *   4. Sky layer (atmospheric gradient)
 *   5. 3D Buildings (fill-extrusion with render_height + glass effect)
 *   6. OpenFreeMap Roads (vector lines)
 *   7. Delivery route (geojson line)
 *   8. CARTO Labels (raster overlay)
 */

import type { StyleSpecification } from 'maplibre-gl'

// ============================================
// TILE SOURCE DEFINITIONS
// ============================================

export const SATELLITE_SOURCES = {
  /** ESRI World Imagery — highest reliability, free, no key needed */
  esri: {
    id: 'esri-world',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxzoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  /** ESRI Clarity — sharper contrast variant for urban areas */
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
}

export const DEFAULT_MAP_CONFIG: MapStyleConfig = {
  nightMode: false,
  buildingHeightExaggeration: 1.0,
  showBuildings: true,
  showRoads: true,
  showWater: true,
  showLabels: true,
  showSatellite: true,
  showSky: true,
  buildingOpacity: 0.75,
  satelliteOpacity: 1.0,
  roadOpacity: 0.85,
  labelOpacity: 0.7,
}

// ============================================
// HELPER: Get label source by mode
// ============================================

export function getLabelSource(nightMode: boolean) {
  return nightMode ? LABEL_SOURCES.dark : LABEL_SOURCES.light
}

// ============================================
// ENHANCED MAPLIBRE STYLE BUILDER
// ============================================

/**
 * Build the complete MapLibre style object for the 3D map.
 * 
 * NEW: Accepts a MapStyleConfig for granular control over every layer.
 * NEW: Includes sky layer for atmospheric rendering.
 * NEW: Building height exaggeration multiplier for visual enhancement.
 * NEW: Glass-like building coloring for tall structures.
 * NEW: Better road hierarchy with width based on class.
 */
export function build3DMapStyle(config: Partial<MapStyleConfig> = {}): StyleSpecification {
  const c = { ...DEFAULT_MAP_CONFIG, ...config }

  // Calculate building height multiplier expression
  const heightMultiplier = c.buildingHeightExaggeration

  return {
    version: 8 as const,
    sources: {
      // Base satellite imagery
      'satellite': {
        type: 'raster' as const,
        tiles: [SATELLITE_SOURCES.esri.url],
        tileSize: 256,
        maxzoom: SATELLITE_SOURCES.esri.maxzoom,
        attribution: SATELLITE_SOURCES.esri.attribution,
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
    // NEW: Sky layer for atmospheric rendering
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
    // NEW: Light configuration for 3D building rendering
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
        maxzoom: 19,
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

      // 4. 3D Buildings — NEW: Enhanced with glass effect and height exaggeration
      ...(c.showBuildings ? [
        {
          id: '3d-buildings',
          type: 'fill-extrusion' as const,
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 13,
          paint: {
            // NEW: Multi-stop color gradient based on height
            // Low buildings: warm concrete tones
            // Mid buildings: cool gray-blue
            // Tall buildings: glass-like teal with blue tint
            'fill-extrusion-color': c.nightMode
              ? [
                  'interpolate', ['linear'], ['get', 'render_height'],
                  0, '#2d2d3f',
                  10, '#3a3a55',
                  20, '#45456b',
                  40, '#555580',
                  60, '#6565a0',
                  80, '#7575bb',
                  100, '#8585d6',
                ]
              : [
                  'interpolate', ['linear'], ['get', 'render_height'],
                  0, '#d4cfc8',    // Ground: warm concrete
                  10, '#c8c4bc',    // Low: light stone
                  20, '#b8b8c4',    // Mid: cool gray
                  40, '#a0a8b8',    // Medium: blue-gray
                  60, '#88a0b8',    // Tall: steel blue
                  80, '#7098c4',    // Higher: glass blue
                  100, '#5890d0',   // Skyscraper: reflective blue
                ],
            // NEW: Height with exaggeration multiplier
            'fill-extrusion-height': [
              '*',
              ['coalesce', ['get', 'render_height'], 5],
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
        // NEW: Building outline layer for better definition
        {
          id: 'building-outline',
          type: 'line' as const,
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 15,
          paint: {
            'line-color': c.nightMode ? '#5a5a7a' : '#a0a0a0',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              15, 0.3,
              17, 0.8,
              19, 1.5,
            ],
            'line-opacity': 0.4,
          },
        },
      ] : []),

      // 5. Road network — NEW: Better hierarchy with class-based styling
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
