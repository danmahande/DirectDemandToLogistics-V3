'use client'

/**
 * Tile Layer Configuration - v5.0
 *
 * Centralized tile layer setup for MapLibre GL and Leaflet maps.
 * Provides a single source of truth for tile source URLs,
 * layer configurations, and AI enhancement integration.
 *
 * Both MapComponent (2D Leaflet) and Map3DComponent (MapLibre GL)
 * use this to configure their tile layers consistently.
 */

import { TILE_SOURCES, DEFAULT_SATELLITE_SOURCE } from '@/lib/config'
import { getTileEnhancer } from '@/lib/ai-tile-enhancer'
import type { AIEnhancementMode, AIQualityLevel } from '@/types/map'

// ============================================
// MAPLIBRE GL TILE SOURCES
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
 * Automatically uses the AI-enhanced protocol when available.
 */
export function getMapLibreStyle(
  options: {
    nightMode?: boolean
    useEnhancedTiles?: boolean
    quality?: AIQualityLevel
    mode?: AIEnhancementMode
    center?: [number, number]
    zoom?: number
    pitch?: number
    bearing?: number
  } = {}
): {
  version: number
  sources: MapLibreTileConfig['sources']
  layers: MapLibreTileConfig['layers']
  glyphs?: string
} & Record<string, unknown> {
  const {
    nightMode = false,
    useEnhancedTiles = true
  } = options

  // Get the tile URL from the enhancer
  let satelliteTileUrl: string
  if (useEnhancedTiles) {
    const enhancer = getTileEnhancer({
      enabled: true,
      quality: options.quality,
      mode: options.mode
    })
    satelliteTileUrl = enhancer.getMapLibreTileUrl()
  } else {
    satelliteTileUrl = TILE_SOURCES.esriWorld.url
  }

  const labelTiles = nightMode
    ? [
        'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png'
      ]
    : [
        'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png'
      ]

  return {
    version: 8,
    sources: {
      'satellite-tiles': {
        type: 'raster',
        tiles: [satelliteTileUrl],
        tileSize: 256,
        maxzoom: 19,
        attribution: useEnhancedTiles
          ? 'Esri, AI-Enhanced by DirectDDL'
          : TILE_SOURCES.esri.attribution
      },
      'labels-tiles': {
        type: 'raster',
        tiles: labelTiles,
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite-tiles',
        minzoom: 0,
        maxzoom: 19
      },
      {
        id: 'labels-layer',
        type: 'raster',
        source: 'labels-tiles',
        minzoom: 10,
        maxzoom: 19,
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
    url: TILE_SOURCES.cartoLight.url,
    options: {
      maxZoom: TILE_SOURCES.cartoLight.maxzoom,
      attribution: TILE_SOURCES.cartoLight.attribution,
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
    url: DEFAULT_SATELLITE_SOURCE.url,
    options: {
      maxZoom: DEFAULT_SATELLITE_SOURCE.maxzoom,
      attribution: DEFAULT_SATELLITE_SOURCE.attribution
    }
  }
}
