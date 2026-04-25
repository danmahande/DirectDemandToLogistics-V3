// ============================================
// SHARED MAP TYPES - v5.0
// ============================================
// Centralized types used across the DirectDDL
// logistics dashboard for map, delivery, and
// AI enhancement features. All components and
// services import from this single source of truth.
// ============================================

// ============================================
// DELIVERY TYPES
// ============================================

export interface Delivery {
  id: number
  shopName: string
  location: string
  products: string
  amount: string
  status: 'pending' | 'in-progress' | 'completed'
  priority: 'urgent' | 'today' | 'later'
  phone: string
  lat: number
  lng: number
  paid: boolean
  region: string
}

export interface RouteStop {
  order: number
  delivery: Delivery
  distance: string
  time: string
}

// ============================================
// REGION TYPES
// ============================================

export interface RegionStats {
  name: string
  totalDeliveries: number
  totalValue: string
  topProducts: { name: string; count: number; trend: 'up' | 'down' | 'same' }[]
  growth: number
  lat: number
  lng: number
}

// ============================================
// ALERT TYPES
// ============================================

export interface Alert {
  id: number
  type: 'stock' | 'payment' | 'order'
  title: string
  message: string
  time: string
}

// ============================================
// NAVIGATION TYPES
// ============================================

export interface TurnInstruction {
  distance: number
  duration: number
  instruction: string
  name: string
  maneuver: string
  modifier?: string
  lat: number
  lng: number
}

export interface POIMarker {
  id: string
  name: string
  type: 'fuel' | 'food' | 'hospital' | 'parking' | 'atm'
  lat: number
  lng: number
}

export interface NavigationStop {
  order: number
  delivery: {
    id: number
    shopName: string
    location: string
    products: string
    amount: string
    lat: number
    lng: number
  }
  distance: string
  time: string
}

export interface Navigation3DProps {
  stops: NavigationStop[]
  onStart?: () => void
  onComplete?: () => void
  onExit?: () => void
  warehouseLat: number
  warehouseLng: number
}

// ============================================
// AI ENHANCEMENT TYPES
// ============================================

export type AIQualityLevel = 'standard' | 'high' | 'ultra'

export type AIEnhancementMode = 'photorealistic' | 'enhanced-satellite' | 'urban-detail' | 'terrain-clarity'

export interface AIEnhancementConfig {
  enabled: boolean
  quality: AIQualityLevel
  mode: AIEnhancementMode
  maxConcurrentRequests: number
  requestDelay: number
  autoEnhance: boolean
  enhanceOnZoom: number[]
  customPrompt?: string
  region?: string
  tileSourceUrl: string
}

export interface TileEnhancementResult {
  blob: Blob
  source: 'ai' | 'canvas' | 'original' | 'cache'
  processingTime?: number
}

export interface EnhancementJobStatus {
  id: string
  z: number
  x: number
  y: number
  status: 'queued' | 'analyzing' | 'generating' | 'completed' | 'failed'
  progress: number
  prompt: string
  error?: string
}

// ============================================
// TILE SOURCE TYPES
// ============================================

export interface TileSource {
  id: string
  name: string
  url: string
  maxzoom: number
  attribution: string
  type: 'satellite' | 'labels-light' | 'labels-dark' | 'hybrid'
}

// ============================================
// TRAFFIC TYPES
// ============================================

export type CongestionLevel = 'low' | 'moderate' | 'heavy' | 'severe'

export interface TrafficData {
  congestionLevel: CongestionLevel
  delayMinutes: number
  incidents: number
  lastUpdated: Date | null
}

// ============================================
// TILE CACHE TYPES
// ============================================

export interface CachedTile {
  enhanced: Blob
  original?: Blob
  aiEnhanced?: Blob
  timestamp: number
  source: 'ai' | 'canvas' | 'original'
  aiPrompt?: string
  aiModel?: string
}

export interface ServerTileCacheEntry {
  data: ArrayBuffer
  timestamp: number
  contentType: string
  enhanced: boolean
  source: 'proxy' | 'canvas-enhanced' | 'ai'
}

export interface AITileCacheEntry {
  data: ArrayBuffer
  timestamp: number
  contentType: string
  source: 'ai' | 'canvas-fallback' | 'original'
  prompt: string
  quality: string
  mode: string
}

// ============================================
// MAP COMPONENT TYPES
// ============================================

export type MapViewMode = '2d' | '3d'
export type MapDisplayMode = 'deliveries' | 'regions' | 'route'
