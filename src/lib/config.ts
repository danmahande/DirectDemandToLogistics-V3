/**
 * Centralized Configuration Constants (v3 — FIXED)
 *
 * KEY FIXES over v2:
 * - Added Google Maps satellite URL (true-color for Kampala)
 * - Updated ESRI satellite URL comment (may show infrared in Africa)
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
  /** Tile proxy cache max entries */
  TILE_CACHE_MAX_SIZE: 500,
  /** Tile proxy cache prune ratio */
  TILE_CACHE_PRUNE_RATIO: 0.25,
  /** Tile proxy cache duration (ms) — 24 hours */
  TILE_CACHE_DURATION: 24 * 60 * 60 * 1000,
  /** Tile proxy request timeout (ms) */
  TILE_PROXY_TIMEOUT: 10000,
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
  /** User agent for tile proxy requests */
  TILE_PROXY: 'DirectDDL-TileProxy/1.0',
} as const

// ============================================
// TILE URLS (FIXED: added Google satellite)
// ============================================

export const TILE_URLS = {
  /** Google Maps Satellite — TRUE COLOR, high-res globally (RECOMMENDED for Kampala) */
  GOOGLE_SATELLITE: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  /** ESRI World Imagery satellite tiles — may show infrared/false-color in parts of Africa */
  ESRI_SATELLITE: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  /** OpenFreeMap vector tiles with building heights */
  OPENFREEMAP_VECTOR: 'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf',
  /** CARTO light labels overlay */
  CARTO_LIGHT_LABELS: 'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png',
  /** CARTO dark labels overlay */
  CARTO_DARK_LABELS: 'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
  /** CARTO Voyager 2D basemap */
  CARTO_VOYAGER: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
  /** CARTO Positron light basemap */
  CARTO_POSITRON: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
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
  /** Raster tile size */
  TILE_SIZE: 256,
  /** Raster max zoom */
  RASTER_MAX_ZOOM: 20,
  /** Label min zoom */
  LABEL_MIN_ZOOM: 10,
} as const

// ============================================
// BUILDING HEIGHT RANGES (for legend)
// ============================================

export const BUILDING_HEIGHT_RANGES = [
  { label: '0–10m', min: 0, max: 10, color: '#e8a838', nightColor: '#4a6fa5', description: 'Low-rise / residential' },
  { label: '10–20m', min: 10, max: 20, color: '#e0922e', nightColor: '#5b82b8', description: 'Small commercial' },
  { label: '20–40m', min: 20, max: 40, color: '#d87c24', nightColor: '#6c95cb', description: 'Mid-rise office' },
  { label: '40–60m', min: 40, max: 60, color: '#c46820', nightColor: '#7da8de', description: 'Tall commercial' },
  { label: '60–80m', min: 60, max: 80, color: '#9c4018', nightColor: '#8ebbef', description: 'High-rise' },
  { label: '80m+', min: 80, max: Infinity, color: '#882c14', nightColor: '#b0e0ff', description: 'Skyscraper' },
] as const
