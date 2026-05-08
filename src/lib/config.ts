/**
 * Centralized Configuration Constants (v2)
 *
 * All API URLs, rate limits, and constants for the logistics dashboard.
 * Only free, no-API-key-required services are used.
 */

// ============================================
// API RATE LIMITS & TIMEOUTS
// ============================================

export const API_LIMITS = {
  /** OSRM route calculation timeout (ms) */
  OSRM_TIMEOUT: 20000,
  /** Nominatim reverse geocoding timeout (ms) */
  NOMINATIM_TIMEOUT: 5000,
  /** Vehicle animation speed (coordinate progress per frame) */
  ANIMATION_SPEED: 0.0003,
  /** Traffic data refresh interval (ms) */
  TRAFFIC_REFRESH_INTERVAL: 120000,
  /** Camera follow timeout after user interaction (ms) */
  CAMERA_FOLLOW_TIMEOUT: 3000,
} as const

// ============================================
// ROUTING SERVICE URLS
// ============================================

export const ROUTING_URLS = {
  /** OSRM free routing API — no key needed */
  OSRM: 'https://router.project-osrm.org/route/v1/driving',
  /** Nominatim reverse geocoding API — no key needed */
  NOMINATIM: 'https://nominatim.openstreetmap.org/reverse',
} as const

// ============================================
// USER AGENTS FOR FREE APIS
// ============================================

export const USER_AGENTS = {
  /** User agent for Nominatim API (required by their policy) */
  NOMINATIM: 'DirectDDL-Navigation/1.0',
} as const

// ============================================
// TILE URLS (for reference — used in tile-sources.ts)
// ============================================

export const TILE_URLS = {
  /** ESRI World Imagery satellite tiles */
  ESRI_SATELLITE: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  /** OpenFreeMap vector tiles with building heights */
  OPENFREEMAP_VECTOR: 'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf',
  /** CARTO light labels overlay */
  CARTO_LIGHT_LABELS: 'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
  /** CARTO dark labels overlay */
  CARTO_DARK_LABELS: 'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
  /** CARTO Voyager 2D basemap */
  CARTO_VOYAGER: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
} as const

// ============================================
// MAP DEFAULTS
// ============================================

export const MAP_DEFAULTS = {
  /** Kampala city center coordinates */
  KAMPALA_CENTER: [0.3250, 32.5800] as [number, number],
  /** Default map zoom level */
  DEFAULT_ZOOM: 13,
  /** Default 3D pitch angle */
  DEFAULT_PITCH: 60,
  /** Max zoom level */
  MAX_ZOOM: 18,
  /** Min zoom level */
  MIN_ZOOM: 10,
} as const
