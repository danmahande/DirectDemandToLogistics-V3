/**
 * Centralized Configuration - v5.0
 *
 * Single source of truth for all tile source URLs,
 * application constants, and default configuration
 * values used across the DirectDDL dashboard.
 *
 * Components and services import from here instead of
 * hardcoding tile URLs and magic numbers.
 */

import type { TileSource, AIEnhancementConfig } from '@/types/map'

// ============================================
// SATELLITE TILE SOURCES
// ============================================

export const TILE_SOURCES: Record<string, TileSource> = {
  esri: {
    id: 'esri',
    name: 'Esri World Imagery (Clarity)',
    url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxzoom: 19,
    attribution: '&copy; Esri',
    type: 'satellite'
  },
  esriWorld: {
    id: 'esriWorld',
    name: 'Esri World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxzoom: 19,
    attribution: '&copy; Esri',
    type: 'satellite'
  },
  cartoLight: {
    id: 'cartoLight',
    name: 'CARTO Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    maxzoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    type: 'labels-light'
  },
  cartoDark: {
    id: 'cartoDark',
    name: 'CARTO Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    maxzoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    type: 'labels-dark'
  },
  cartoLightLabels: {
    id: 'cartoLightLabels',
    name: 'CARTO Light Labels Only',
    url: 'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
    maxzoom: 19,
    attribution: '&copy; CARTO',
    type: 'labels-light'
  },
  cartoDarkLabels: {
    id: 'cartoDarkLabels',
    name: 'CARTO Dark Labels Only',
    url: 'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
    maxzoom: 19,
    attribution: '&copy; CARTO',
    type: 'labels-dark'
  }
}

// ============================================
// DEFAULT SATELLITE TILE SOURCE
// ============================================

export const DEFAULT_SATELLITE_SOURCE = TILE_SOURCES.esri
export const FALLBACK_SATELLITE_SOURCE = TILE_SOURCES.esriWorld

// ============================================
// MAP CENTER & BOUNDS (Kampala, Uganda)
// ============================================

export const KAMPALA_CENTER = {
  lat: 0.3152,
  lng: 32.5814
} as const

export const WAREHOUSE_LOCATION = {
  lat: 0.3152,
  lng: 32.5814,
  name: 'Nakasero Warehouse'
} as const

export const KAMPALA_BOUNDS = {
  north: 0.42,
  south: 0.22,
  east: 32.72,
  west: 32.48
} as const

// ============================================
// AI ENHANCEMENT DEFAULTS
// ============================================

export const DEFAULT_AI_CONFIG: AIEnhancementConfig = {
  enabled: true,
  quality: 'high',
  mode: 'enhanced-satellite',
  maxConcurrentRequests: 2,
  requestDelay: 300,
  autoEnhance: true,
  enhanceOnZoom: [14, 15, 16, 17, 18],
  region: 'Kampala, Uganda',
  tileSourceUrl: DEFAULT_SATELLITE_SOURCE.url
}

// ============================================
// CANVAS PREPROCESSING DEFAULTS
// ============================================

export const CANVAS_PREPROCESSING_DEFAULTS = {
  brightness: 10,
  contrast: 18,
  saturation: 25,
  sharpness: 40
} as const

// ============================================
// WEBGL ENHANCEMENT DEFAULTS
// ============================================

export const WEBGL_ENHANCEMENT_DEFAULTS = {
  sharpen: 0.7,
  contrast: 1.15,
  saturation: 1.25,
  brightness: 1.08,
  vibrance: 0.3,
  clarity: 0.4
} as const

// ============================================
// CACHE CONFIGURATION
// ============================================

export const CACHE_CONFIG = {
  clientMemoryMax: 500,
  clientIndexedDBName: 'ai-tile-cache-v5',
  clientIndexedDBVersion: 5,
  serverProxyCacheTTL: 24 * 60 * 60 * 1000,   // 24 hours
  serverAICacheTTL: 48 * 60 * 60 * 1000,       // 48 hours
  serverProxyCacheMax: 5000,
  serverAICacheMax: 3000,
  serverOriginalCacheMax: 5000
} as const

// ============================================
// POI MARKERS (Kampala)
// ============================================

export const POI_MARKERS = [
  { id: 'fuel1', name: 'Shell Kampala', type: 'fuel' as const, lat: 0.3180, lng: 32.5820 },
  { id: 'fuel2', name: 'Total Nakasero', type: 'fuel' as const, lat: 0.3150, lng: 32.5810 },
  { id: 'food1', name: 'Cafe Javas', type: 'food' as const, lat: 0.3200, lng: 32.5830 },
  { id: 'food2', name: 'Java House', type: 'food' as const, lat: 0.3340, lng: 32.5830 },
  { id: 'hospital1', name: 'Mulago Hospital', type: 'hospital' as const, lat: 0.3350, lng: 32.5720 },
  { id: 'hospital2', name: 'International Hospital', type: 'hospital' as const, lat: 0.3400, lng: 32.5900 },
  { id: 'atm1', name: 'Stanbic ATM', type: 'atm' as const, lat: 0.3160, lng: 32.5805 },
  { id: 'parking1', name: 'Garden City Parking', type: 'parking' as const, lat: 0.3190, lng: 32.5815 }
] as const

// ============================================
// OSRM ROUTING
// ============================================

export const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'

// ============================================
// MAPLIBRE PROTOCOL
// ============================================

export const AI_ENHANCED_PROTOCOL = 'ai-enhanced'
export const AI_ENHANCED_TILE_URL = `${AI_ENHANCED_PROTOCOL}://satellite/{z}/{x}/{y}`
