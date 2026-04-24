// ═══════════════════════════════════════════════════════════
// OSRM ROUTING SERVICE - Real Road Navigation
// Uses Open Source Routing Machine for turn-by-turn directions
// ═══════════════════════════════════════════════════════════

export interface Coordinate {
  lat: number
  lng: number
}

export interface RouteStep {
  distance: number // meters
  duration: number // seconds
  instruction: string
  name: string // road name
  mode: string // driving, ferry, etc
  maneuver: {
    type: string // turn, new name, depart, arrive, etc
    modifier?: string // left, right, straight, etc
    location: [number, number] // [lng, lat]
    bearing_before: number
    bearing_after: number
  }
  geometry: string // encoded polyline
}

export interface RouteLeg {
  distance: number // meters
  duration: number // seconds
  steps: RouteStep[]
  summary: string
}

export interface Route {
  distance: number // meters
  duration: number // seconds
  geometry: string // encoded polyline
  legs: RouteLeg[]
}

export interface RoutingResponse {
  code: string
  routes: Route[]
  waypoints: {
    location: [number, number]
    name: string
  }[]
}

// OSRM Demo Server - Free for development
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving'

// Timeout for API requests (10 seconds)
const API_TIMEOUT = 10000

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

/**
 * Get route between multiple waypoints
 */
export async function getRoute(coordinates: Coordinate[]): Promise<RoutingResponse | null> {
  if (coordinates.length < 2) return null

  // Format coordinates for OSRM: lng,lat;lng,lat;...
  const coordsStr = coordinates
    .map(c => `${c.lng},${c.lat}`)
    .join(';')

  const url = `${OSRM_BASE_URL}/${coordsStr}?overview=full&geometries=polyline&steps=true&annotations=true`

  try {
    const response = await fetchWithTimeout(url, API_TIMEOUT)
    
    if (!response.ok) {
      console.error('OSRM API error:', response.status)
      return null
    }
    
    const data: RoutingResponse = await response.json()
    
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('OSRM routing failed:', data.code)
      return null
    }
    
    return data
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error('OSRM API request timed out')
      } else {
        console.error('Routing request failed:', error.message)
      }
    }
    return null
  }
}

/**
 * Decode polyline string to array of coordinates
 * Google's encoded polyline algorithm
 */
export function decodePolyline(encoded: string): Coordinate[] {
  const coords: Coordinate[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1)
    lat += deltaLat

    // Decode longitude
    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1)
    lng += deltaLng

    // OSRM uses 5 decimal places precision
    coords.push({
      lat: lat / 1e5,
      lng: lng / 1e5
    })
  }

  return coords
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${Math.round(meters)} m`
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes}min`
  }
  return `${minutes} min`
}

/**
 * Get turn direction icon
 */
export function getTurnIcon(maneuverType: string, modifier?: string): string {
  // Build maneuver key
  if (maneuverType === 'turn' && modifier) {
    if (modifier.includes('left')) return modifier.includes('slight') ? '↖' : modifier.includes('sharp') ? '⬅' : '↰'
    if (modifier.includes('right')) return modifier.includes('slight') ? '↗' : modifier.includes('sharp') ? '➡' : '↱'
    if (modifier.includes('uturn')) return '↩'
  }
  
  if (maneuverType === 'merge' && modifier) {
    return modifier.includes('left') ? '↰' : '↱'
  }
  
  if (maneuverType === 'roundabout') {
    return '↻'
  }
  
  if (maneuverType === 'depart') return '🚀'
  if (maneuverType === 'arrive') return '🏁'
  if (maneuverType === 'continue') return '⬆'
  if (maneuverType === 'new-name') return '⬆'
  
  return '⬆'
}

/**
 * Get turn instruction text
 */
export function getTurnText(maneuverType: string, modifier?: string): string {
  if (maneuverType === 'turn' && modifier) {
    if (modifier.includes('uturn')) return 'Make U-turn'
    if (modifier.includes('sharp left')) return 'Turn sharp left'
    if (modifier.includes('sharp right')) return 'Turn sharp right'
    if (modifier.includes('slight left')) return 'Keep left'
    if (modifier.includes('slight right')) return 'Keep right'
    if (modifier.includes('left')) return 'Turn left'
    if (modifier.includes('right')) return 'Turn right'
  }
  
  if (maneuverType === 'new-name' || maneuverType === 'continue') {
    return 'Continue'
  }
  
  if (maneuverType === 'merge') {
    return 'Merge'
  }
  
  if (maneuverType === 'roundabout') {
    return 'Enter roundabout'
  }
  
  if (maneuverType === 'depart') {
    return 'Start'
  }
  
  if (maneuverType === 'arrive') {
    return 'Arrive'
  }
  
  return 'Continue'
}

/**
 * Get bearing between two points
 */
export function calculateBearing(from: Coordinate, to: Coordinate): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180
  const lat1 = (from.lat * Math.PI) / 180
  const lat2 = (to.lat * Math.PI) / 180

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

  let bearing = (Math.atan2(y, x) * 180) / Math.PI
  bearing = (bearing + 360) % 360

  return bearing
}

/**
 * Get current step based on distance traveled
 */
export function getCurrentStep(
  steps: RouteStep[],
  distanceTraveled: number
): { step: RouteStep; stepIndex: number; progressInStep: number } {
  let accumulated = 0

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (accumulated + step.distance > distanceTraveled) {
      const progressInStep = distanceTraveled - accumulated
      return { step, stepIndex: i, progressInStep }
    }
    accumulated += step.distance
  }

  // Return last step if past the end
  const lastStep = steps[steps.length - 1]
  return {
    step: lastStep,
    stepIndex: steps.length - 1,
    progressInStep: lastStep.distance
  }
}

/**
 * Generate simulated turn-by-turn directions from coordinates
 * Used when OSRM API is not available
 */
export function generateSimulatedDirections(
  coordinates: Coordinate[]
): RouteStep[] {
  const steps: RouteStep[] = []
  
  if (coordinates.length < 2) return steps
  
  // Depart step
  steps.push({
    distance: 0,
    duration: 0,
    instruction: 'Start navigation',
    name: '',
    mode: 'driving',
    maneuver: {
      type: 'depart',
      location: [coordinates[0].lng, coordinates[0].lat],
      bearing_before: 0,
      bearing_after: calculateBearing(coordinates[0], coordinates[1])
    },
    geometry: ''
  })
  
  // Generate simple steps for each waypoint
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1]
    const curr = coordinates[i]
    
    // Calculate distance between points
    const R = 6371000 // Earth radius in meters
    const dLat = (curr.lat - prev.lat) * Math.PI / 180
    const dLng = (curr.lng - prev.lng) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(prev.lat * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    const distance = R * c
    
    const isLast = i === coordinates.length - 1
    
    steps.push({
      distance: distance,
      duration: distance / 15, // Assume 15 m/s average speed
      instruction: isLast ? 'Arrive at destination' : `Continue to waypoint ${i}`,
      name: '',
      mode: 'driving',
      maneuver: {
        type: isLast ? 'arrive' : 'continue',
        location: [curr.lng, curr.lat],
        bearing_before: calculateBearing(prev, curr),
        bearing_after: isLast ? 0 : calculateBearing(curr, coordinates[i + 1] || curr)
      },
      geometry: ''
    })
  }
  
  return steps
}
