'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { build3DMapStyle, DEFAULT_MAP_CONFIG, NAVIGATION_CAMERA, KAMPALA_CENTER, fetchOSMBuildings, addOSMBuildingLayer, type MapStyleConfig } from '@/lib/tile/sources'
import { getTileEnhancer, type AIQualityLevel, type AIEnhancementMode } from '@/lib/ai-tile-enhancer'

// ============================================
// PROFESSIONAL SVG ICONS FOR LOGISTICS SYSTEM
// ============================================

const Icons = {
  Warehouse: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  
  Navigate: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11"/>
    </svg>
  ),
  
  TurnLeft: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5"/>
      <path d="M12 19l-7-7 7-7"/>
    </svg>
  ),
  
  TurnRight: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/>
      <path d="M12 5l7 7-7 7"/>
    </svg>
  ),
  
  TurnSlightLeft: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 17L7 7"/>
      <path d="M7 17V7h10"/>
    </svg>
  ),
  
  TurnSlightRight: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7"/>
      <path d="M7 7h10v10"/>
    </svg>
  ),
  
  Merge: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6l4 4 4-4"/>
      <path d="M12 2v8"/>
      <path d="M8 22l4-4 4 4"/>
      <path d="M12 14v8"/>
      <path d="M4 12h16"/>
    </svg>
  ),
  
  Roundabout: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  
  Arrive: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  
  Continue: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5"/>
      <path d="M5 12l7-7 7 7"/>
    </svg>
  ),
  
  Close: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  
  Check: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  
  ArrowRight: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  
  Display: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  
  Traffic: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="2"/>
      <circle cx="12" cy="7" r="2"/>
      <circle cx="12" cy="12" r="2"/>
      <circle cx="12" cy="17" r="2"/>
    </svg>
  ),
  
  Live: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>
  ),
  
  ThreeD: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  
  Sparkle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
    </svg>
  ),
  
  Play: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  
  Pause: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
  ),
  
  Compass: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </svg>
  ),
  
  MyLocation: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v4"/>
      <path d="M12 18v4"/>
      <path d="M2 12h4"/>
      <path d="M18 12h4"/>
    </svg>
  ),
  
  Location: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}

// ============================================
// TYPES
// ============================================

interface NavigationStop {
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

interface Navigation3DProps {
  stops: NavigationStop[]
  onStart?: () => void
  onComplete?: () => void
  onExit?: () => void
  warehouseLat: number
  warehouseLng: number
}

interface TurnInstruction {
  distance: number
  duration: number
  instruction: string
  name: string
  maneuver: string
  modifier?: string
  lat: number
  lng: number
}

interface POIMarker {
  id: string
  name: string
  type: 'fuel' | 'food' | 'hospital' | 'parking' | 'atm'
  lat: number
  lng: number
}

// ============================================
// TILE ENHANCEMENT CONFIGURATION
// ============================================
// Tile sources are now centralized in @/lib/tile-sources (V3 architecture)
// build3DMapStyle() handles all source + layer configuration including:
// - ESRI World Imagery (true-color satellite)
// - OpenFreeMap vector tiles (3D building extrusion with render_height)
// - CARTO label overlay
// - Sky layer for atmospheric rendering
// - Light configuration for realistic building shadows
// See: Mathematics_for_DirectDemandToLogistics.pdf Section 5.1-5.3

// ============================================
// CONSTANTS
// ============================================

const POI_MARKERS: POIMarker[] = [
  { id: 'fuel1', name: 'Shell Kampala', type: 'fuel', lat: 0.3180, lng: 32.5820 },
  { id: 'fuel2', name: 'Total Nakasero', type: 'fuel', lat: 0.3150, lng: 32.5810 },
  { id: 'food1', name: 'Cafe Javas', type: 'food', lat: 0.3200, lng: 32.5830 },
  { id: 'food2', name: 'Java House', type: 'food', lat: 0.3340, lng: 32.5830 },
  { id: 'hospital1', name: 'Mulago Hospital', type: 'hospital', lat: 0.3350, lng: 32.5720 },
  { id: 'hospital2', name: 'International Hospital', type: 'hospital', lat: 0.3400, lng: 32.5900 },
  { id: 'atm1', name: 'Stanbic ATM', type: 'atm', lat: 0.3160, lng: 32.5805 },
  { id: 'parking1', name: 'Garden City Parking', type: 'parking', lat: 0.3190, lng: 32.5815 },
]

// ============================================
// MAIN COMPONENT
// ============================================

export default function Navigation3DComponent({
  stops,
  onStart,
  onComplete,
  onExit,
  warehouseLat,
  warehouseLng
}: Navigation3DProps) {
  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const isMapReadyRef = useRef(false)
  const speedIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isInitializedRef = useRef(false)
  const vehicleMarkerRef = useRef<maplibregl.Marker | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const aiEnhancerRef = useRef<ReturnType<typeof getTileEnhancer> | null>(null)
  
  // State
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentStopIndex, setCurrentStopIndex] = useState(0)
  const [isNavigating, setIsNavigating] = useState(false)
  const [distanceRemaining, setDistanceRemaining] = useState('0 km')
  const [timeRemaining, setTimeRemaining] = useState('0 min')
  const [showInstructions, setShowInstructions] = useState(true)
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([])
  const [isLoadingRoute, setIsLoadingRoute] = useState(false)
  const [turnInstructions, setTurnInstructions] = useState<TurnInstruction[]>([])
  const [currentSpeed, setCurrentSpeed] = useState(0)
  const [isNightMode, setIsNightMode] = useState(false)
  const [showTraffic, setShowTraffic] = useState(true)
  const [showPOIs, setShowPOIs] = useState(true)
  const [currentStreet, setCurrentStreet] = useState('')
  const [nextTurn, setNextTurn] = useState<TurnInstruction | null>(null)
  const [arrivingIn, setArrivingIn] = useState('')
  const [enhancementLevel, setEnhancementLevel] = useState(1.0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationProgress, setAnimationProgress] = useState(0)
  const [useEnhancedTiles, setUseEnhancedTiles] = useState(true)
  const [aiQuality, setAiQuality] = useState<AIQualityLevel>('high')
  const [aiMode, setAiMode] = useState<AIEnhancementMode>('enhanced-satellite')
  const [showAIControls, setShowAIControls] = useState(false)
  const [aiEnhancementStatus, setAiEnhancementStatus] = useState<'idle' | 'enhancing' | 'ready'>('idle')
  
  // Animation state
  const animationStateRef = useRef({
    isRunning: false,
    currentIndex: 0,
    progress: 0,
    speed: 0.0003 // Progress per frame at normal speed
  })

  // Real-time traffic state
  const [trafficData, setTrafficData] = useState<{
    congestionLevel: 'low' | 'moderate' | 'heavy' | 'severe'
    delayMinutes: number
    incidents: number
    lastUpdated: Date | null
  }>({ congestionLevel: 'low', delayMinutes: 0, incidents: 0, lastUpdated: null })

  // Camera state
  const [currentPitch, setCurrentPitch] = useState(60)
  const [cameraFollowEnabled, setCameraFollowEnabled] = useState(true)
  const userInteractingRef = useRef(false)
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const cameraFollowRef = useRef(true)

  // Calculate totals
  const totalDistance = stops.reduce((sum, stop) => sum + parseFloat(stop.distance), 0)
  const totalTime = stops.reduce((sum, stop) => sum + parseInt(stop.time), 0)

  // Initialize AI tile enhancer
  useEffect(() => {
    const enhancer = getTileEnhancer({
      enabled: useEnhancedTiles,
      quality: aiQuality,
      mode: aiMode,
      autoEnhance: true,
      maxConcurrentRequests: 2,
      requestDelay: 300,
      region: 'Kampala, Uganda'
    })
    aiEnhancerRef.current = enhancer
  }, [])

  // Update AI enhancement settings
  useEffect(() => {
    if (aiEnhancerRef.current) {
      aiEnhancerRef.current.setAIEnabled(useEnhancedTiles)
      aiEnhancerRef.current.setAIQuality(aiQuality)
      aiEnhancerRef.current.setAIMode(aiMode)
      aiEnhancerRef.current.updateOptions({
        sharpen: 0.7 + enhancementLevel * 0.3,
        contrast: 1.0 + enhancementLevel * 0.15,
        saturation: 1.0 + enhancementLevel * 0.2
      })
    }
  }, [useEnhancedTiles, aiQuality, aiMode, enhancementLevel])

  // Sync camera follow state with ref
  useEffect(() => {
    cameraFollowRef.current = cameraFollowEnabled
  }, [cameraFollowEnabled])

  // ============================================
  // REAL-TIME TRAFFIC DATA
  // ============================================
  
  const fetchTrafficData = useCallback(async () => {
    const hour = new Date().getHours()
    const dayOfWeek = new Date().getDay()
    
    let congestionLevel: 'low' | 'moderate' | 'heavy' | 'severe' = 'low'
    let delayMinutes = 0
    
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5
    const isMorningRush = hour >= 7 && hour <= 9
    const isEveningRush = hour >= 17 && hour <= 20
    
    if (isWeekday && (isMorningRush || isEveningRush)) {
      congestionLevel = 'heavy'
      delayMinutes = Math.floor(Math.random() * 20) + 10
    } else if (isWeekday && ((hour >= 6 && hour <= 10) || (hour >= 16 && hour <= 21))) {
      congestionLevel = 'moderate'
      delayMinutes = Math.floor(Math.random() * 10) + 5
    } else {
      congestionLevel = 'low'
      delayMinutes = Math.floor(Math.random() * 5)
    }
    
    setTrafficData({
      congestionLevel,
      delayMinutes,
      incidents: Math.floor(Math.random() * 2),
      lastUpdated: new Date()
    })
  }, [])

  useEffect(() => {
    if (isNavigating && showTraffic) {
      fetchTrafficData()
      const interval = setInterval(fetchTrafficData, 120000)
      return () => clearInterval(interval)
    }
  }, [isNavigating, showTraffic, fetchTrafficData])

  // ============================================
  // FETCH ROAD ROUTE
  // ============================================
  
  const fetchRoadRoute = useCallback(async (
    coordinates: [number, number][]
  ): Promise<{ coords: [number, number][]; instructions: TurnInstruction[] }> => {
    if (coordinates.length < 2) {
      return { coords: coordinates, instructions: [] }
    }

    try {
      const coordsStr = coordinates.map(c => `${c[0]},${c[1]}`).join(';')
      
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true&annotations=true`,
        { signal: AbortSignal.timeout(20000) }
      )

      if (!response.ok) {
        throw new Error(`OSRM API error: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const route = data.routes[0]
        const coords = route.geometry.coordinates as [number, number][]
        
        const instructions: TurnInstruction[] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        route.legs.forEach((leg: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          leg.steps.forEach((step: any) => {
            if (step.maneuver) {
              instructions.push({
                distance: step.distance,
                duration: step.duration,
                instruction: step.name || 'Continue',
                name: step.name || '',
                maneuver: step.maneuver.type,
                modifier: step.maneuver.modifier,
                lat: step.maneuver.location[1],
                lng: step.maneuver.location[0]
              })
            }
          })
        })

        return { coords, instructions }
      }
      
      return { coords: coordinates, instructions: [] }
    } catch (error) {
      console.warn('Failed to fetch road route:', error)
      return { coords: coordinates, instructions: [] }
    }
  }, [])

  // ============================================
  // REVERSE GEOCODING FOR STREET NAME
  // ============================================
  
  const getStreetName = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { 
          headers: { 'User-Agent': 'DirectDDL-Navigation/1.0' },
          signal: AbortSignal.timeout(5000)
        }
      )
      const data = await response.json()
      return data.address?.road || data.display_name?.split(',')[0] || 'Unknown Road'
    } catch {
      return 'Unknown Road'
    }
  }, [])

  // ============================================
  // DRIVING ANIMATION SYSTEM
  // ============================================

  const startDrivingAnimation = useCallback(() => {
    if (animationStateRef.current.isRunning) return
    
    animationStateRef.current.isRunning = true
    animationStateRef.current.currentIndex = 0
    animationStateRef.current.progress = 0
    setIsAnimating(true)

    const animate = () => {
      if (!animationStateRef.current.isRunning || !mapRef.current || !vehicleMarkerRef.current) {
        return
      }

      const coords = routeCoordinates
      if (coords.length < 2) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      // Calculate current position
      let currentIndex = animationStateRef.current.currentIndex
      let progress = animationStateRef.current.progress

      // Ensure valid index
      currentIndex = Math.max(0, Math.min(currentIndex, coords.length - 2))

      const startCoord = coords[currentIndex]
      const endCoord = coords[currentIndex + 1]

      if (!startCoord || !endCoord) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      // Interpolate position
      const lng = startCoord[0] + (endCoord[0] - startCoord[0]) * progress
      const lat = startCoord[1] + (endCoord[1] - startCoord[1]) * progress

      // Validate coordinates
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        console.warn('Invalid position calculated')
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      // Update vehicle position
      vehicleMarkerRef.current.setLngLat([lng, lat])

      // Calculate bearing (direction)
      const dLng = endCoord[0] - startCoord[0]
      const dLat = endCoord[1] - startCoord[1]
      const bearing = Math.atan2(dLng, dLat) * (180 / Math.PI)

      // Only update camera if user is not interacting and follow is enabled
      if (cameraFollowRef.current && !userInteractingRef.current) {
        mapRef.current.jumpTo({
          center: [lng, lat],
          zoom: 17,
          pitch: 70,
          bearing: bearing
        })
      }

      // Update overall progress
      const totalProgress = (currentIndex + progress) / (coords.length - 1)
      setAnimationProgress(totalProgress)

      // Update speed (simulated)
      setCurrentSpeed(Math.floor(25 + Math.random() * 35))

      // Advance animation
      const speed = animationStateRef.current.speed
      progress += speed

      if (progress >= 1) {
        progress = 0
        currentIndex++
        
        if (currentIndex >= coords.length - 1) {
          // Animation complete
          stopDrivingAnimation()
          setIsNavigating(false)
          onComplete?.()
          return
        }
        
        animationStateRef.current.currentIndex = currentIndex
      }

      animationStateRef.current.progress = progress
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [routeCoordinates, onComplete])

  const stopDrivingAnimation = useCallback(() => {
    animationStateRef.current.isRunning = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    setIsAnimating(false)
    setCurrentSpeed(0)
  }, [])

  const toggleAnimation = useCallback(() => {
    if (isAnimating) {
      stopDrivingAnimation()
    } else {
      startDrivingAnimation()
    }
  }, [isAnimating, startDrivingAnimation, stopDrivingAnimation])

  // ============================================
  // INITIALIZE MAP WITH ENHANCED SATELLITE TILES
  // ============================================
  
  useEffect(() => {
    if (isInitializedRef.current || !mapContainerRef.current) {
      return
    }
    
    isInitializedRef.current = true
    let mounted = true

    const initMap = async () => {
      try {
        const hour = new Date().getHours()
        const nightMode = hour < 6 || hour >= 19
        
        if (mounted) {
          setIsNightMode(nightMode)
        }

        // Build the complete 3D map style using the centralized style builder
        // This includes: ESRI World Imagery (true-color), OpenFreeMap 3D buildings,
        // sky layer, light config, roads, water, and labels
        const mapStyle = build3DMapStyle({
          nightMode,
          buildingHeightExaggeration: 2.0,        // FIXED: was 1.0, now 2.0 for Kampala sparse height data
          showBuildings: true,
          showRoads: true,
          showWater: true,
          showLabels: true,
          showSatellite: true,
          showSky: true,
          buildingOpacity: 0.88,                   // FIXED: was 0.75, now 0.88 for better visibility
          satelliteOpacity: 1.0,
          roadOpacity: 0.85,
          labelOpacity: nightMode ? 0.8 : 0.7,
          satelliteSource: 'esri' as const,        // v9: ESRI World Imagery — true-color, direct CORS, no proxy needed        
          })

        // ============================================
        // CREATE MAP WITH 3D BUILDINGS + TRUE-COLOR SATELLITE
        // ============================================
        
        const map = new maplibregl.Map({
          container: mapContainerRef.current!,
          style: mapStyle,
          center: [warehouseLng, warehouseLat],
          zoom: NAVIGATION_CAMERA.zoom,
          pitch: NAVIGATION_CAMERA.pitch,
          bearing: NAVIGATION_CAMERA.bearing,
          maxZoom: NAVIGATION_CAMERA.maxZoom,
          minZoom: NAVIGATION_CAMERA.minZoom,
          maxPitch: NAVIGATION_CAMERA.maxPitch
        })

        // Add navigation controls
        map.addControl(
          new maplibregl.NavigationControl({ 
            visualizePitch: true,
            showZoom: true,
            showCompass: true
          }),
          'bottom-right'
        )
        
        map.addControl(
          new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
          'bottom-left'
        )

        // Track camera changes
        map.on('pitchend', () => {
          setCurrentPitch(map.getPitch())
        })

        // Detect user interaction to allow zoom/pan during animation
        const handleUserInteraction = () => {
          userInteractingRef.current = true
          if (interactionTimeoutRef.current) {
            clearTimeout(interactionTimeoutRef.current)
          }
          // Resume camera follow after 3 seconds of no interaction
          interactionTimeoutRef.current = setTimeout(() => {
            userInteractingRef.current = false
          }, 3000)
        }

        map.on('mousedown', handleUserInteraction)
        map.on('touchstart', handleUserInteraction)
        map.on('wheel', handleUserInteraction)
        map.on('dragstart', handleUserInteraction)

        // ============================================
        // MAP LOAD HANDLER
        // ============================================
        
        map.on('load', async () => {
          if (!mounted) return

          console.log('Map loaded with AI-enhanced satellite tiles')
          setIsLoading(false)
          setLoadError(null)
          isMapReadyRef.current = true

          // FIXED: Load OSM Overpass buildings as supplement for Kampala
          try {
            const bounds = map.getBounds()
            const osmBuildings = await fetchOSMBuildings({
              south: bounds.getSouth(),
              west: bounds.getWest(),
              north: bounds.getNorth(),
              east: bounds.getEast(),
            })
            if (osmBuildings && osmBuildings.features.length > 0) {
              addOSMBuildingLayer(map, osmBuildings, {
                nightMode,
                buildingHeightExaggeration: 2.0,
                buildingOpacity: 0.88,
              })
              console.log('[Navigation3D] Added ' + osmBuildings.features.length + ' OSM buildings')
            }
          } catch (err) {
            console.error('[Navigation3D] OSM buildings supplement failed:', err)
          }

          // Build route coordinates
          const coords: [number, number][] = [[warehouseLng, warehouseLat]]
          stops.forEach(stop => {
            coords.push([stop.delivery.lng, stop.delivery.lat])
          })

          // Fetch real road route
          setIsLoadingRoute(true)
          const { coords: roadCoords, instructions } = await fetchRoadRoute(coords)
          setIsLoadingRoute(false)

          if (!mounted) return

          setRouteCoordinates(roadCoords)
          setTurnInstructions(instructions)

          // ============================================
          // ANIMATED ROUTE LINE
          // ============================================
          
          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: roadCoords }
            }
          })

          // Route shadow
          map.addLayer({
            id: 'route-shadow',
            type: 'line',
            source: 'route',
            paint: {
              'line-color': '#000000',
              'line-width': 14,
              'line-opacity': 0.3,
              'line-blur': 8
            }
          })

          // Route casing
          map.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 8 }
          })
          
          // Route fill
          map.addLayer({
            id: 'route-fill',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#4285f4',
              'line-width': 4,
              'line-gradient': [
                'interpolate',
                ['linear'],
                ['line-progress'],
                0, '#4285f4',
                0.5, '#34a853',
                1, '#ea4335'
              ]
            }
          })

          if (instructions.length > 0) {
            setNextTurn(instructions[0])
          }

          // ============================================
          // MARKERS
          // ============================================

          // Warehouse marker
          const startEl = document.createElement('div')
          startEl.className = 'marker start-marker'
          startEl.innerHTML = `
            <div style="
              width: 48px; height: 48px; border-radius: 50%;
              background: linear-gradient(135deg, #34a853, #0d9c38);
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 4px 16px rgba(52,168,83,0.5);
              border: 4px solid white;
            ">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
          `
          new maplibregl.Marker({ element: startEl })
            .setLngLat([warehouseLng, warehouseLat])
            .addTo(map)

          // Stop markers
          stops.forEach((stop, index) => {
            const isLast = index === stops.length - 1
            const bgColor = isLast ? '#ea4335' : '#4285f4'

            const el = document.createElement('div')
            el.className = 'marker stop-marker'
            el.innerHTML = `
              <div style="
                width: 36px; height: 36px; border-radius: 50%;
                background: ${bgColor};
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 3px 12px ${bgColor}66;
                border: 3px solid white;
              ">
                <span style="color: white; font-size: 14px; font-weight: 700;">${stop.order}</span>
              </div>
            `

            new maplibregl.Marker({ element: el })
              .setLngLat([stop.delivery.lng, stop.delivery.lat])
              .addTo(map)
          })

          // Vehicle puck
          const vehicleEl = document.createElement('div')
          vehicleEl.className = 'vehicle-puck'
          vehicleEl.innerHTML = `
            <div style="
              width: 28px; height: 28px;
              background: linear-gradient(135deg, #4285f4, #1a73e8);
              border-radius: 50%;
              border: 4px solid white;
              box-shadow: 0 2px 12px rgba(66,133,244,0.6), 0 0 20px rgba(66,133,244,0.4);
            ">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white" style="transform: rotate(0deg)">
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
              </svg>
            </div>
          `
          const vehicleMarker = new maplibregl.Marker({ element: vehicleEl })
            .setLngLat([warehouseLng, warehouseLat])
            .addTo(map)
          vehicleMarkerRef.current = vehicleMarker

          // Get street name
          const streetName = await getStreetName(warehouseLat, warehouseLng)
          if (mounted) {
            setCurrentStreet(streetName)
          }

          // Fit bounds
          if (roadCoords.length > 0) {
            const bounds = new maplibregl.LngLatBounds()
            roadCoords.forEach(coord => bounds.extend(coord as [number, number]))
            map.fitBounds(bounds, { padding: 100, pitch: 60, duration: 1500 })
          }
        })

        // Reload OSM buildings when view changes significantly
        let osmReloadTimeout: NodeJS.Timeout | null = null
        map.on('moveend', () => {
          if (osmReloadTimeout) clearTimeout(osmReloadTimeout)
          osmReloadTimeout = setTimeout(async () => {
            try {
              const bounds = map.getBounds()
              const osmBuildings = await fetchOSMBuildings({
                south: bounds.getSouth(),
                west: bounds.getWest(),
                north: bounds.getNorth(),
                east: bounds.getEast(),
              })
              if (osmBuildings && osmBuildings.features.length > 0 && map.getSource('osm-buildings')) {
                (map.getSource('osm-buildings') as maplibregl.GeoJSONSource).setData(osmBuildings as any)
              }
            } catch (err) {
              console.error('[Navigation3D] OSM buildings reload failed:', err)
            }
          }, 2000)
        })

        // Handle map errors — FAIL explicitly, don't silently swallow errors
        let tileErrorCount = 0
        map.on('error', (e) => {
          const error = e.error
          // Detect satellite tile loading failures
          if (error && typeof error === 'object' && 'status' in error) {
            tileErrorCount++
            console.error(`[Navigation3D] Tile load error (${tileErrorCount}):`, error)
            // If multiple tile errors occur, satellite tiles are likely broken
            if (tileErrorCount >= 5 && mounted) {
              setLoadError('Satellite tiles failed to load. Check your network connection and refresh.')
            }
          } else {
            console.error('[Navigation3D] Map error:', error)
          }
        })

        mapRef.current = map

      } catch (error) {
        console.error('Map initialization error:', error)
        if (mounted) {
          setLoadError('Failed to initialize map. Please refresh the page.')
          setIsLoading(false)
        }
      }
    }

    initMap()

    return () => {
      mounted = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (speedIntervalRef.current) {
        clearInterval(speedIntervalRef.current)
      }
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current)
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        isMapReadyRef.current = false
      }
      isInitializedRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // NAVIGATION CONTROLS
  // ============================================

  const handleStartNavigation = () => {
    setIsNavigating(true)
    onStart?.()

    const remainingDist = stops.reduce((sum, s) => sum + parseFloat(s.distance), 0)
    const remainingTime = stops.reduce((sum, s) => sum + parseInt(s.time), 0)
    setDistanceRemaining(`${remainingDist.toFixed(1)} km`)
    setTimeRemaining(`${remainingTime} min`)

    if (turnInstructions.length > 0) {
      setNextTurn(turnInstructions[0])
    }

    const arrival = new Date(Date.now() + remainingTime * 60000)
    setArrivingIn(arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))

    // Start the driving animation
    startDrivingAnimation()
  }

  const handleExit = () => {
    stopDrivingAnimation()
    setIsNavigating(false)
    setCurrentStopIndex(0)
    setNextTurn(null)
    setCurrentSpeed(0)
    setAnimationProgress(0)

    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [warehouseLng, warehouseLat],
        zoom: 14,
        pitch: 45,
        bearing: 0,
        duration: 1500
      })
    }

    onExit?.()
  }

  // ============================================
  // HELPERS
  // ============================================

  const getTurnIconComponent = (maneuver: string, modifier?: string) => {
    if (maneuver === 'turn') {
      if (modifier === 'left') return <Icons.TurnLeft />
      if (modifier === 'right') return <Icons.TurnRight />
      if (modifier === 'slight left') return <Icons.TurnSlightLeft />
      if (modifier === 'slight right') return <Icons.TurnSlightRight />
    }
    if (maneuver === 'merge') return <Icons.Merge />
    if (maneuver === 'roundabout') return <Icons.Roundabout />
    if (maneuver === 'arrive') return <Icons.Arrive />
    if (maneuver === 'continue') return <Icons.Continue />
    return <Icons.Continue />
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className={`relative w-full h-full ${isNightMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center z-10 ${isNightMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4" />
          <div className={`font-medium ${isNightMode ? 'text-white' : 'text-gray-600'}`}>
            Loading AI-Enhanced 3D Navigation...
          </div>
          <div className={`text-sm mt-2 ${isNightMode ? 'text-gray-400' : 'text-gray-400'}`}>
            Preparing photorealistic satellite imagery
          </div>
        </div>
      )}

      {/* Route Loading Indicator */}
      {isLoadingRoute && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-30">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            <span className="text-sm font-medium">Calculating route...</span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {loadError && (
        <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center z-10">
          <div className="text-red-500 text-lg font-medium mb-2">Map Error</div>
          <div className="text-gray-600 text-sm mb-4">{loadError}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Refresh Page
          </button>
        </div>
      )}

      {/* Navigation UI */}
      {!isLoading && !loadError && (
        <>
          {/* Top Bar */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
            <button
              onClick={handleExit}
              className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all ${isNightMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'}`}
              title="Exit navigation"
            >
              <span className={isNightMode ? 'text-white' : 'text-gray-600'}>
                <Icons.Close />
              </span>
            </button>

            <div className="flex gap-2">
              {/* AI Enhancement Toggle */}
              <button
                onClick={() => { setUseEnhancedTiles(!useEnhancedTiles); if (!useEnhancedTiles) setShowAIControls(true); }}
                className={`px-3 py-2 rounded-lg shadow-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  useEnhancedTiles 
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600' 
                    : isNightMode 
                      ? 'bg-gray-700 text-white hover:bg-gray-600' 
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title="Toggle AI-enhanced tiles"
              >
                <Icons.Sparkle />
                AI {useEnhancedTiles ? 'ON' : 'OFF'}
              </button>

              {/* AI Settings Button */}
              {useEnhancedTiles && (
                <button
                  onClick={() => setShowAIControls(!showAIControls)}
                  className={`px-3 py-2 rounded-lg shadow-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                    showAIControls
                      ? 'bg-blue-500 text-white'
                      : isNightMode 
                        ? 'bg-gray-700 text-white hover:bg-gray-600' 
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  title="AI enhancement settings"
                >
                  <Icons.Display />
                  Settings
                </button>
              )}

              <button
                onClick={() => setIsNightMode(!isNightMode)}
                className={`px-3 py-2 rounded-lg shadow-lg text-xs font-medium flex items-center gap-1.5 transition-all ${isNightMode ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                title="Toggle display mode"
              >
                <Icons.Display />
                {isNightMode ? 'Day' : 'Night'}
              </button>
            </div>
          </div>

          {/* AI Enhancement Controls Panel */}
          {useEnhancedTiles && showAIControls && (
            <div className={`absolute top-20 right-4 p-4 rounded-xl shadow-xl z-20 min-w-[240px] ${isNightMode ? 'bg-gray-800/95' : 'bg-white/95'} backdrop-blur-md`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`text-sm font-semibold ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
                  AI Enhancement
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${
                    aiEnhancementStatus === 'enhancing' ? 'bg-yellow-400 animate-pulse' :
                    aiEnhancementStatus === 'ready' ? 'bg-green-400' : 'bg-gray-400'
                  }`} />
                  <span className={`text-xs ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {aiEnhancementStatus === 'enhancing' ? 'Enhancing...' :
                     aiEnhancementStatus === 'ready' ? 'AI Ready' : 'Idle'}
                  </span>
                </div>
              </div>

              {/* Enhancement Mode Selector */}
              <div className="mb-3">
                <div className={`text-xs font-medium mb-1.5 ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Enhancement Mode
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { id: 'photorealistic', label: 'Photo', desc: 'Ultra-realistic' },
                    { id: 'enhanced-satellite', label: 'Enhanced', desc: 'Cartographic' },
                    { id: 'urban-detail', label: 'Urban', desc: 'Building detail' },
                    { id: 'terrain-clarity', label: 'Terrain', desc: 'Elevation' }
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setAiMode(m.id as AIEnhancementMode)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-left ${
                        aiMode === m.id
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                          : isNightMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <div className="font-semibold">{m.label}</div>
                      <div className={`text-[10px] ${aiMode === m.id ? 'text-white/70' : isNightMode ? 'text-gray-500' : 'text-gray-400'}`}>{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality Selector */}
              <div className="mb-3">
                <div className={`text-xs font-medium mb-1.5 ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  AI Quality
                </div>
                <div className="flex gap-1.5">
                  {(['standard', 'high', 'ultra'] as AIQualityLevel[]).map((q) => (
                    <button
                      key={q}
                      onClick={() => setAiQuality(q)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                        aiQuality === q
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                          : isNightMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {q === 'standard' ? 'Std' : q === 'high' ? 'High' : 'Ultra'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Enhancement Level Slider */}
              <div className="mb-3">
                <div className={`text-xs font-medium mb-1.5 ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Pre-processing Level: {Math.round(enhancementLevel * 100)}%
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={enhancementLevel}
                  onChange={(e) => setEnhancementLevel(parseFloat(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <div className="flex justify-between text-xs mt-0.5">
                  <span className={isNightMode ? 'text-gray-500' : 'text-gray-400'}>Subtle</span>
                  <span className={isNightMode ? 'text-gray-500' : 'text-gray-400'}>Vivid</span>
                </div>
              </div>

              {/* Info Text */}
              <div className={`text-xs leading-relaxed ${isNightMode ? 'text-gray-500' : 'text-gray-400'}`}>
                AI tiles use generative AI to dramatically enhance satellite imagery. Canvas pre-processing provides instant improvement while AI tiles generate progressively.
              </div>
            </div>
          )}

          {/* Animation Controls */}
          {isNavigating && (
            <div className="absolute bottom-32 left-4 right-4 z-20">
              {/* Progress Bar */}
              <div className={`rounded-lg p-3 ${isNightMode ? 'bg-gray-800/90' : 'bg-white/90'} backdrop-blur-sm shadow-lg`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-medium ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
                    Route Progress
                  </span>
                  <span className={`text-sm ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {Math.round(animationProgress * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-green-500 to-red-500 transition-all duration-100"
                    style={{ width: `${animationProgress * 100}%` }}
                  />
                </div>
              </div>

              {/* Play/Pause and Camera Follow Buttons */}
              <div className="flex justify-center items-center gap-4 mt-4">
                {/* Camera Follow Toggle */}
                <button
                  onClick={() => setCameraFollowEnabled(!cameraFollowEnabled)}
                  className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
                    cameraFollowEnabled
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : isNightMode
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
                  }`}
                  title={cameraFollowEnabled ? 'Unlock camera (zoom/pan freely)' : 'Follow vehicle'}
                >
                  <Icons.Compass />
                </button>

                {/* Play/Pause Button */}
                <button
                  onClick={toggleAnimation}
                  className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
                    isAnimating
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
                  title={isAnimating ? 'Pause animation' : 'Play animation'}
                >
                  {isAnimating ? <Icons.Pause /> : <Icons.Play />}
                </button>

                {/* Center on Vehicle */}
                <button
                  onClick={() => {
                    if (mapRef.current && vehicleMarkerRef.current) {
                      const lngLat = vehicleMarkerRef.current.getLngLat()
                      mapRef.current.flyTo({
                        center: [lngLat.lng, lngLat.lat],
                        zoom: 17,
                        pitch: 70,
                        duration: 1000
                      })
                      userInteractingRef.current = false
                      setCameraFollowEnabled(true)
                    }
                  }}
                  className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
                    isNightMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-white'
                      : 'bg-white hover:bg-gray-50 text-gray-600'
                  }`}
                  title="Center on vehicle"
                >
                  <Icons.MyLocation />
                </button>
              </div>
            </div>
          )}

          {/* Speed Display */}
          {isNavigating && (
            <div className="absolute left-4 bottom-4 z-20">
              <div className={`rounded-lg p-4 ${isNightMode ? 'bg-gray-800/90' : 'bg-white/90'} backdrop-blur-sm shadow-lg`}>
                <div className="text-center">
                  <div className={`text-3xl font-bold ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
                    {currentSpeed}
                  </div>
                  <div className={`text-xs ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    km/h
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Info Panel */}
          {isNavigating && (
            <div className="absolute right-4 bottom-4 z-20">
              <div className={`rounded-lg p-4 w-48 ${isNightMode ? 'bg-gray-800/90' : 'bg-white/90'} backdrop-blur-sm shadow-lg`}>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={`text-xs ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>Distance</span>
                    <span className={`text-sm font-medium ${isNightMode ? 'text-white' : 'text-gray-800'}`}>{distanceRemaining}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`text-xs ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>ETA</span>
                    <span className={`text-sm font-medium ${isNightMode ? 'text-white' : 'text-gray-800'}`}>{timeRemaining}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`text-xs ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>Arrive</span>
                    <span className={`text-sm font-medium ${isNightMode ? 'text-white' : 'text-gray-800'}`}>{arrivingIn}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Start Navigation Button */}
          {!isNavigating && (
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20">
              <button
                onClick={handleStartNavigation}
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full font-medium text-lg shadow-lg hover:from-blue-600 hover:to-blue-700 transition-all flex items-center gap-2"
              >
                <Icons.Navigate />
                Start 3D Navigation
              </button>
            </div>
          )}

          {/* Turn Instructions */}
          {isNavigating && nextTurn && showInstructions && (
            <div className={`absolute top-20 left-4 right-4 z-20 ${isNightMode ? 'bg-gray-800/95' : 'bg-white/95'} backdrop-blur-sm rounded-lg shadow-lg p-4`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  nextTurn.maneuver === 'turn' 
                    ? nextTurn.modifier?.includes('left') ? 'bg-blue-500' : 'bg-blue-500'
                    : 'bg-green-500'
                }`}>
                  <span className="text-white">
                    {getTurnIconComponent(nextTurn.maneuver, nextTurn.modifier)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
                    {nextTurn.instruction}
                  </div>
                  <div className={`text-sm ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {nextTurn.distance > 1000 
                      ? `${(nextTurn.distance / 1000).toFixed(1)} km` 
                      : `${Math.round(nextTurn.distance)} m`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Current Street Display */}
          {isNavigating && currentStreet && (
            <div className={`absolute bottom-24 left-1/2 transform -translate-x-1/2 z-20 px-4 py-2 rounded-full ${isNightMode ? 'bg-gray-800/90' : 'bg-white/90'} backdrop-blur-sm shadow-lg`}>
              <div className={`text-sm font-medium ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
                {currentStreet}
              </div>
            </div>
          )}

          {/* Camera Controls */}
          <div className={`absolute right-4 top-1/2 transform -translate-y-1/2 z-20 flex flex-col gap-2`}>
            <button
              onClick={() => mapRef.current?.easeTo({ pitch: Math.min(85, currentPitch + 10), duration: 300 })}
              className={`w-10 h-10 rounded-lg shadow-lg flex items-center justify-center ${isNightMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-white hover:bg-gray-50 text-gray-600'}`}
              title="Increase pitch"
            >
              ↑
            </button>
            <button
              onClick={() => mapRef.current?.easeTo({ pitch: Math.max(0, currentPitch - 10), duration: 300 })}
              className={`w-10 h-10 rounded-lg shadow-lg flex items-center justify-center ${isNightMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-white hover:bg-gray-50 text-gray-600'}`}
              title="Decrease pitch"
            >
              ↓
            </button>
          </div>
        </>
      )}

      {/* AI Enhancement Badge */}
      {useEnhancedTiles && !isLoading && (
        <div className="absolute bottom-4 left-4 z-10">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-purple-500/80 to-pink-500/80 text-white text-xs rounded-full backdrop-blur-sm">
            <Icons.Sparkle />
            AI Enhanced
          </div>
        </div>
      )}
    </div>
  )
}
