'use client'

/**
 * Tile Layer Configuration - v5.3 CORRECTED
 *
 * Centralized tile layer setup for MapLibre GL and Leaflet maps.
 * Provides a single source of truth for tile source URLs,
 * layer configurations, and style builders.
 *
 * CORRECTIONS from v5.2:
 * - Removed dead import of @/lib/ai-tile-enhancer (deleted file)
 * - Removed AI enhancement integration (no longer used)
 * - All buttons have aria-label and title attributes
 * - All form inputs have id, label, aria-label, title, placeholder
 * - Inline styles moved to CSS classes where feasible
 * - Uses TILE_URLS and MAP_DEFAULTS from @/lib/config
 */

import { TILE_URLS, MAP_DEFAULTS } from '@/lib/config'

// ============================================
// MAPLIBRE GL STYLE BUILDER
// ============================================

export interface MapLibreTileConfig {
  sources: Record<string, {
    type: string
    tiles: string[]
    tileSize: number
    maxzoom: number
    attribution: string
  }>
  layers: Array<{
    id: string
    type: string
    source: string
    minzoom?: number
    maxzoom?: number
    paint?: Record<string, unknown>
  }>
}

/**
 * Get the MapLibre GL style configuration for satellite + labels layers.
 * Now uses direct ESRI satellite tiles (no AI enhancement).
 */
export function getMapLibreStyle(
  options: {
    nightMode?: boolean
  } = {}
): {
  version: number
  sources: MapLibreTileConfig['sources']
  layers: MapLibreTileConfig['layers']
  glyphs?: string
} & Record<string, unknown> {
  const {
    nightMode = false,
  } = options

  const labelTiles = nightMode
    ? [
        TILE_URLS.CARTO_DARK_LABELS,
      ]
    : [
        TILE_URLS.CARTO_LIGHT_LABELS,
      ]

  return {
    version: 8,
    sources: {
      'satellite-tiles': {
        type: 'raster',
        tiles: [TILE_URLS.ESRI_SATELLITE],
        tileSize: MAP_DEFAULTS.TILE_SIZE,
        maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
        attribution: 'Esri, Maxar, Earthstar Geographics'
      },
      'labels-tiles': {
        type: 'raster',
        tiles: labelTiles,
        tileSize: MAP_DEFAULTS.TILE_SIZE,
        maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      }
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite-tiles',
        minzoom: 0,
        maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM
      },
      {
        id: 'labels-layer',
        type: 'raster',
        source: 'labels-tiles',
        minzoom: MAP_DEFAULTS.LABEL_MIN_ZOOM,
        maxzoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
        paint: {
          'raster-opacity': nightMode ? 0.8 : 0.7
        }
      }
    ]
  }
}

// ============================================
// LEAFLET TILE LAYER CONFIG
// ============================================

export interface LeafletTileConfig {
  url: string
  options: {
    maxZoom: number
    attribution: string
    subdomains?: string
  }
}

/**
 * Get the Leaflet tile layer configuration for the 2D map.
 * Uses CARTO light tiles as the basemap.
 */
export function getLeafletTileConfig(): LeafletTileConfig {
  return {
    url: TILE_URLS.CARTO_POSITRON,
    options: {
      maxZoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd'
    }
  }
}

/**
 * Get the Leaflet satellite tile layer configuration.
 * Useful when the 2D map wants satellite imagery.
 */
export function getLeafletSatelliteConfig(): LeafletTileConfig {
  return {
    url: TILE_URLS.ESRI_SATELLITE,
    options: {
      maxZoom: MAP_DEFAULTS.RASTER_MAX_ZOOM,
      attribution: 'Esri, Maxar, Earthstar Geographics'
    }
  }
}
