/**
 * Shared Map Type Definitions (v2)
 *
 * Type definitions used across map components for the 3D logistics dashboard.
 * These types align with the OSRM API and MapLibre GL JS interfaces.
 */

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

// ============================================
// ROUTE TYPES
// ============================================

export interface RouteStop {
  order: number
  delivery: Delivery
  distance: string
  time: string
}

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

// ============================================
// MAP STYLE TYPES
// ============================================

export interface MapStyleConfig {
  nightMode: boolean
  showBuildings: boolean
  buildingOpacity: number
  showLabels: boolean
  labelOpacity: number
}

// ============================================
// NAVIGATION STATE TYPES
// ============================================

export interface NavigationState {
  isNavigating: boolean
  isAnimating: boolean
  animationProgress: number
  distanceRemaining: string
  timeRemaining: string
  currentSpeed: number
  currentStreet: string
}

// ============================================
// TRAFFIC DATA TYPES
// ============================================

export interface TrafficData {
  congestionLevel: 'low' | 'moderate' | 'heavy' | 'severe'
  delayMinutes: number
  lastUpdated: Date | null
}

// ============================================
// REGION STATS TYPES
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
// CONSTANTS
// ============================================

export const DEFAULT_MAP_CONFIG: MapStyleConfig = {
  nightMode: false,
  showBuildings: true,
  buildingOpacity: 0.75,
  showLabels: true,
  labelOpacity: 0.7,
}

/** Kampala city center for map initialization */
export const KAMPALA_CENTER: [number, number] = [0.3250, 32.5800]

/** Default warehouse location (Nakasero Market area) */
export const WAREHOUSE = {
  lat: 0.3118,
  lng: 32.5795,
  name: 'Uganda Distributors Warehouse',
  address: 'Nakasero Market Area, Kampala',
} as const
