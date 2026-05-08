// ═══════════════════════════════════════════════════════════
// MAP STYLE BUILDER (v5 — NEW)
// ═══════════════════════════════════════════════════════════
// Builds MapLibre GL style specifications for the 3D map.
// Replaces the old tile-sources.ts with a cleaner architecture.
//
// Layer order (rendered bottom-to-top):
//   1. ESRI Satellite (raster base)
//   2. OpenFreeMap Water (vector fill)
//   3. OpenFreeMap Landuse (vector, subtle fill)
//   4. 3D Buildings (fill-extrusion with render_height)
//   5. Building Outlines (line for definition)
//   6. Road network (vector lines, class-based hierarchy)
//   7. CARTO Labels (raster overlay)
//
// NEW features:
//   - Sky layer for atmospheric rendering
//   - Light positioning for realistic building shadows
//   - Building height exaggeration multiplier
//   - Glass-like building color gradients for tall structures
//   - Separate layer visibility toggles via MapStyleConfig
// ═══════════════════════════════════════════════════════════

import type { StyleSpecification } from 'maplibre-gl'
import { TILE_URLS, MAP_DEFAULTS } from '@/lib/config'
import type { MapStyleConfig } from '@/types/map'
import { DEFAULT_MAP_CONFIG } from '@/types/map'

// ============================================
// STYLE BUILDER
// ============================================

/**
 * Build the complete MapLibre style object for the 3D map.
 *
 * @param config - Partial style config; merges with DEFAULT_MAP_CONFIG
 * @returns Complete StyleSpecification for MapLibre GL
 */
export function build3DMapStyle(config: Partial<MapStyleConfig> = {}): StyleSpecification {
  const c: MapStyleConfig = { ...DEFAULT_MAP_CONFIG, ...config }
  const h = c.buildingHeightExaggeration

  return {
    version: 8 as const,
    sources: {
      // Base satellite imagery
      'satellite': {
        type: 'raster' as const,
        tiles: [TILE_URLS.ESRI_SATELLITE],
        tileSize: MAP_DEFAULTS.TILE_SIZE,
        maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      },
      // OpenFreeMap vector tiles — buildings, roads, water
      'openmaptiles': {
        type: 'vector',
        tiles: [TILE_URLS.OPENFREEMAP_VECTOR],
        maxzoom: MAP_DEFAULTS.OPENFREEMAP_MAX_ZOOM,
        attribution: 'OpenFreeMap, OpenMapTiles, OpenStreetMap',
      },
      // Label overlay
      'labels': {
        type: 'raster' as const,
        tiles: [c.nightMode ? TILE_URLS.CARTO_DARK_LABELS : TILE_URLS.CARTO_LIGHT_LABELS],
        tileSize: MAP_DEFAULTS.TILE_SIZE,
        maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
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
        : [1.15, 90, 30],   // Morning sunlight from east (Kampala)
    },

    layers: [
      // ── 1. SATELLITE BASE ──────────────────────────────
      ...(c.showSatellite ? [{
        id: 'satellite-layer',
        type: 'raster' as const,
        source: 'satellite',
        minzoom: 0,
        maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
        paint: {
          'raster-opacity': c.satelliteOpacity,
          'raster-brightness-max': c.nightMode ? 0.6 : 1.0,
          'raster-saturation': c.nightMode ? 0.3 : 1.0,
        },
      }] : []),

      // ── 2. WATER FEATURES ──────────────────────────────
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

      // ── 3. LANDUSE ─────────────────────────────────────
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

      // ── 4. 3D BUILDINGS ────────────────────────────────
      ...(c.showBuildings ? [
        {
          id: '3d-buildings',
          type: 'fill-extrusion' as const,
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: MAP_DEFAULTS.BUILDING_MIN_ZOOM,
          paint: {
            // Height-based color gradient
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
                  0, '#d4cfc8',
                  10, '#c8c4bc',
                  20, '#b8b8c4',
                  40, '#a0a8b8',
                  60, '#88a0b8',
                  80, '#7098c4',
                  100, '#5890d0',
                ],
            // Height with exaggeration multiplier
            'fill-extrusion-height': ['*', ['coalesce', ['get', 'render_height'], 5], h],
            'fill-extrusion-base': ['*', ['coalesce', ['get', 'render_min_height'], 0], h],
            'fill-extrusion-opacity': c.buildingOpacity,
          },
        },
        // Building outlines for definition
        {
          id: 'building-outline',
          type: 'line' as const,
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: MAP_DEFAULTS.BUILDING_OUTLINE_MIN_ZOOM,
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

      // ── 5. ROAD NETWORK ────────────────────────────────
      ...(c.showRoads ? [
        // Major roads casing
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
              10, 1, 12, 2, 14, 5, 16, 10, 18, 18,
            ],
            'line-opacity': 0.6,
          },
        },
        // Major roads fill
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
              10, 0.5, 12, 1, 14, 3, 16, 6, 18, 12,
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
              12, 0.5, 14, 2, 16, 4, 18, 8,
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
              14, 0.3, 16, 1.5, 18, 3,
            ],
            'line-opacity': 0.5,
          },
        },
      ] : []),

      // ── 6. LABEL OVERLAY ───────────────────────────────
      ...(c.showLabels ? [{
        id: 'labels-layer',
        type: 'raster' as const,
        source: 'labels',
        minzoom: MAP_DEFAULTS.LABEL_MIN_ZOOM,
        maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
        paint: {
          'raster-opacity': c.labelOpacity,
        },
      }] : []),
    ].filter(Boolean),
  } as StyleSpecification
}

// ============================================
// 2D BASEMAP STYLE BUILDER
// ============================================

/**
 * Build a simple 2D basemap style for Leaflet or 2D MapLibre view.
 */
export function build2DMapStyle(variant: 'voyager' | 'positron' | 'darkMatter' = 'voyager'): StyleSpecification {
  const urlMap = {
    voyager: TILE_URLS.CARTO_VOYAGER,
    positron: TILE_URLS.CARTO_POSITRON,
    darkMatter: TILE_URLS.CARTO_DARK_MATTER,
  }

  return {
    version: 8 as const,
    sources: {
      'basemap': {
        type: 'raster' as const,
        tiles: [urlMap[variant]],
        tileSize: MAP_DEFAULTS.TILE_SIZE,
        maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
        attribution: 'CARTO, OpenStreetMap',
      },
    },
    layers: [{
      id: 'basemap-layer',
      type: 'raster',
      source: 'basemap',
      minzoom: 0,
      maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
    }],
  }
}
