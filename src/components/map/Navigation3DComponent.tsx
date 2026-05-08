'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { build3DMapStyle } from '@/lib/tile/sources'
import { API_LIMITS, ROUTING_URLS, USER_AGENTS } from '@/lib/config'
import type { RouteStop, TurnInstruction, TrafficData } from '@/types/map'

// ═══════════════════════════════════════════════════════════
// NAVIGATION 3D COMPONENT (v6 — FIXED)
// ═══════════════════════════════════════════════════════════
// Full 3D navigation experience with:
// - MapLibre GL 3D fill-extrusion buildings
// - ESRI satellite base + OpenFreeMap vector data
// - OSRM turn-by-turn routing
// - Animated vehicle tracking along route
// - Real-time traffic simulation
// - Day/night mode
// - Building height controls
//
// FIXES (v6):
// - Fixed import: @/lib/map-style → @/lib/tile-sources
// - Fixed build3DMapStyle({ nightMode }) → build3DMapStyle(nightMode)
// - Removed unused imports (MapStyleConfig, NavigationState, etc.)
// - All accessibility corrections from v5 retained
// ═══════════════════════════════════════════════════════════

// ============================================
// SVG ICONS (all with aria-hidden)
// ============================================

const Icons = {
  Close: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  ),
  TurnLeft: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
  ),
  TurnRight: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
  ),
  Continue: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
  ),
  Arrive: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  ),
  Play: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21"/></svg>
  ),
  Pause: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
  ),
  Building: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>
  ),
}

// ============================================
// TYPES
// ============================================

interface Navigation3DProps {
  stops: RouteStop[]
  warehouseLat: number
  warehouseLng: number
  onStart?: () => void
  onComplete?: () => void
  onExit?: () => void
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function Navigation3DComponent({
  stops,
  warehouseLat,
  warehouseLng,
  onStart,
  onComplete,
  onExit,
}: Navigation3DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const isInitializedRef = useRef(false)
  const vehicleMarkerRef = useRef<maplibregl.Marker | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([])
  const [isLoadingRoute, setIsLoadingRoute] = useState(false)
  const [turnInstructions, setTurnInstructions] = useState<TurnInstruction[]>([])
  const [nextTurn, setNextTurn] = useState<TurnInstruction | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationProgress, setAnimationProgress] = useState(0)
  const [nightMode, setIsNightMode] = useState(false)
  const [currentSpeed, setCurrentSpeed] = useState(0)
  const [currentStreet, setCurrentStreet] = useState('')
  const [showBuildings, setShowBuildings] = useState(true)
  const [buildingOpacity, setBuildingOpacity] = useState(0.75)
  const [show3DSettings, setShow3DSettings] = useState(false)
  const [distanceRemaining, setDistanceRemaining] = useState('0 km')
  const [timeRemaining, setTimeRemaining] = useState('0 min')
  const [arrivingIn, setArrivingIn] = useState('')
  const [trafficData, setTrafficData] = useState<TrafficData>({
    congestionLevel: 'low',
    delayMinutes: 0,
    lastUpdated: null,
  })

  // Camera follow state
  const userInteractingRef = useRef(false)
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const cameraFollowRef = useRef(true)

  // Animation state
  const animStateRef = useRef({
    isRunning: false,
    currentIndex: 0,
    progress: 0,
    speed: API_LIMITS.ANIMATION_SPEED,
  })

  const totalDistance = stops.reduce((sum, s) => sum + parseFloat(s.distance), 0)
  const totalTime = stops.reduce((sum, s) => sum + parseInt(s.time), 0)

  // ============================================
  // TRAFFIC SIMULATION
  // ============================================

  const fetchTrafficData = useCallback(() => {
    const hour = new Date().getHours()
    const isWeekday = new Date().getDay() >= 1 && new Date().getDay() <= 5
    const isRush = isWeekday && ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20))

    const level: TrafficData['congestionLevel'] = isRush ? 'heavy' : isWeekday && hour >= 6 && hour <= 21 ? 'moderate' : 'low'
    const delay = isRush ? Math.floor(Math.random() * 20) + 10 : isWeekday ? Math.floor(Math.random() * 10) + 5 : Math.floor(Math.random() * 5)

    setTrafficData({ congestionLevel: level, delayMinutes: delay, lastUpdated: new Date() })
  }, [])

  useEffect(() => {
    if (!isNavigating) return
    fetchTrafficData()
    const interval = setInterval(fetchTrafficData, API_LIMITS.TRAFFIC_REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [isNavigating, fetchTrafficData])

  // ============================================
  // OSRM ROUTE FETCHING
  // ============================================

  const fetchRoadRoute = useCallback(async (
    coordinates: [number, number][]
  ): Promise<{ coords: [number, number][]; instructions: TurnInstruction[] }> => {
    if (coordinates.length < 2) return { coords: coordinates, instructions: [] }

    try {
      const coordsStr = coordinates.map(c => `${c[0]},${c[1]}`).join(';')
      const response = await fetch(
        `${ROUTING_URLS.OSRM}/${coordsStr}?overview=full&geometries=geojson&steps=true&annotations=true`,
        { signal: AbortSignal.timeout(API_LIMITS.OSRM_TIMEOUT) }
      )

      if (!response.ok) throw new Error(`OSRM error: ${response.status}`)
      const data = await response.json()

      if (data.code === 'Ok' && data.routes?.[0]) {
        const route = data.routes[0]
        const coords = route.geometry.coordinates as [number, number][]
        const instructions: TurnInstruction[] = []

        route.legs.forEach((leg: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          leg.steps.forEach((step: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (step.maneuver) {
              instructions.push({
                distance: step.distance,
                duration: step.duration,
                instruction: step.name || 'Continue',
                name: step.name || '',
                maneuver: step.maneuver.type,
                modifier: step.maneuver.modifier,
                lat: step.maneuver.location[1],
                lng: step.maneuver.location[0],
              })
            }
          })
        })

        return { coords, instructions }
      }

      return { coords: coordinates, instructions: [] }
    } catch (err) {
      console.warn('OSRM route fetch failed:', err)
      return { coords: coordinates, instructions: [] }
    }
  }, [])

  // ============================================
  // REVERSE GEOCODING
  // ============================================

  const getStreetName = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `${ROUTING_URLS.NOMINATIM}?lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'User-Agent': USER_AGENTS.NOMINATIM }, signal: AbortSignal.timeout(API_LIMITS.NOMINATIM_TIMEOUT) }
      )
      const data = await response.json()
      return data.address?.road || data.display_name?.split(',')[0] || 'Unknown Road'
    } catch {
      return 'Unknown Road'
    }
  }, [])

  // ============================================
  // DRIVING ANIMATION
  // ============================================

  const startDrivingAnimation = useCallback(() => {
    if (animStateRef.current.isRunning) return

    animStateRef.current.isRunning = true
    animStateRef.current.currentIndex = 0
    animStateRef.current.progress = 0
    setIsAnimating(true)

    const animate = () => {
      if (!animStateRef.current.isRunning || !mapRef.current || !vehicleMarkerRef.current) return

      const coords = routeCoordinates
      if (coords.length < 2) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      let { currentIndex, progress } = animStateRef.current
      currentIndex = Math.max(0, Math.min(currentIndex, coords.length - 2))

      const start = coords[currentIndex]
      const end = coords[currentIndex + 1]
      if (!start || !end) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      const lng = start[0] + (end[0] - start[0]) * progress
      const lat = start[1] + (end[1] - start[1]) * progress

      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      vehicleMarkerRef.current.setLngLat([lng, lat])

      const bearing = Math.atan2(end[0] - start[0], end[1] - start[1]) * (180 / Math.PI)

      if (cameraFollowRef.current && !userInteractingRef.current) {
        mapRef.current.jumpTo({ center: [lng, lat], zoom: 17, pitch: 70, bearing })
      }

      const totalProgress = (currentIndex + progress) / (coords.length - 1)
      setAnimationProgress(totalProgress)
      setCurrentSpeed(Math.floor(25 + Math.random() * 35))

      progress += animStateRef.current.speed

      if (progress >= 1) {
        progress = 0
        currentIndex++
        if (currentIndex >= coords.length - 1) {
          animStateRef.current.isRunning = false
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
          setIsAnimating(false)
          setIsNavigating(false)
          setCurrentSpeed(0)
          onComplete?.()
          return
        }
      }

      animStateRef.current.currentIndex = currentIndex
      animStateRef.current.progress = progress
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [routeCoordinates, onComplete])

  const stopDrivingAnimation = useCallback(() => {
    animStateRef.current.isRunning = false
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    setIsAnimating(false)
    setCurrentSpeed(0)
  }, [])

  // ============================================
  // MAP INITIALIZATION
  // ============================================

  useEffect(() => {
    if (isInitializedRef.current || !mapContainerRef.current) return
    isInitializedRef.current = true
    let mounted = true

    const initMap = async () => {
      try {
        const hour = new Date().getHours()
        const night = hour < 6 || hour >= 19
        if (mounted) setIsNightMode(night)

        // FIXED: build3DMapStyle takes a boolean, not an object
        const mapStyle = build3DMapStyle(night)

        const map = new maplibregl.Map({
          container: mapContainerRef.current!,
          style: mapStyle,
          center: [warehouseLng, warehouseLat],
          zoom: 15,
          pitch: 60,
          bearing: 0,
          maxZoom: 18,
          minZoom: 10,
          maxPitch: 85,
        })

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left')

        // Detect user interaction for camera follow
        const handleInteraction = () => {
          userInteractingRef.current = true
          if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current)
          interactionTimeoutRef.current = setTimeout(() => { userInteractingRef.current = false }, API_LIMITS.CAMERA_FOLLOW_TIMEOUT)
        }
        map.on('mousedown', handleInteraction)
        map.on('touchstart', handleInteraction)
        map.on('wheel', handleInteraction)
        map.on('dragstart', handleInteraction)

        // ── MAP LOAD ──
        map.on('load', async () => {
          if (!mounted) return
          setIsLoading(false)
          setLoadError(null)

          // Build route coordinates
          const coords: [number, number][] = [[warehouseLng, warehouseLat]]
          stops.forEach(s => coords.push([s.delivery.lng, s.delivery.lat]))

          // Fetch road route from OSRM
          setIsLoadingRoute(true)
          const { coords: roadCoords, instructions } = await fetchRoadRoute(coords)
          setIsLoadingRoute(false)
          if (!mounted) return

          setRouteCoordinates(roadCoords)
          setTurnInstructions(instructions)

          // ── ROUTE LAYERS ──
          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: roadCoords } },
          })

          map.addLayer({ id: 'route-shadow', type: 'line', source: 'route', paint: { 'line-color': '#000', 'line-width': 14, 'line-opacity': 0.3, 'line-blur': 8 } })
          map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8 } })
          map.addLayer({
            id: 'route-fill', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#4285f4', 'line-width': 4,
              'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#34a853', 0.5, '#4285f4', 1, '#ea4335'],
            },
          })

          if (instructions.length > 0) setNextTurn(instructions[0])

          // ── MARKERS ──
          const startEl = document.createElement('div')
          startEl.innerHTML = `<div class="nav-marker-warehouse"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`
          new maplibregl.Marker({ element: startEl }).setLngLat([warehouseLng, warehouseLat]).addTo(map)

          stops.forEach((stop) => {
            const isLast = stop.order === stops.length
            const bg = isLast ? '#ea4335' : '#4285f4'
            const el = document.createElement('div')
            el.innerHTML = `<div class="nav-marker-stop" style="background:${bg};box-shadow:0 3px 12px ${bg}66"><span>${stop.order}</span></div>`
            new maplibregl.Marker({ element: el }).setLngLat([stop.delivery.lng, stop.delivery.lat]).addTo(map)
          })

          // Vehicle puck
          const vehicleEl = document.createElement('div')
          vehicleEl.innerHTML = `<div class="nav-marker-vehicle"><svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg></div>`
          vehicleMarkerRef.current = new maplibregl.Marker({ element: vehicleEl }).setLngLat([warehouseLng, warehouseLat]).addTo(map)

          // Street name
          const street = await getStreetName(warehouseLat, warehouseLng)
          if (mounted) setCurrentStreet(street)

          // Fit bounds
          if (roadCoords.length > 0) {
            const bounds = new maplibregl.LngLatBounds()
            roadCoords.forEach(c => bounds.extend(c as [number, number]))
            map.fitBounds(bounds, { padding: 100, pitch: 60, duration: 1500 })
          }
        })

        map.on('error', () => { /* non-critical */ })
        mapRef.current = map
      } catch (error) {
        console.error('Map init error:', error)
        if (mounted) { setLoadError('Failed to initialize map'); setIsLoading(false) }
      }
    }

    initMap()

    return () => {
      mounted = false
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      isInitializedRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Building opacity live update
  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    try {
      if (map.getLayer('3d-buildings')) {
        map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', showBuildings ? buildingOpacity : 0)
      }
    } catch { /* layer may not exist */ }
  }, [buildingOpacity, showBuildings])

  // ============================================
  // NAVIGATION CONTROLS
  // ============================================

  const handleStartNavigation = () => {
    setIsNavigating(true)
    onStart?.()
    const remDist = stops.reduce((sum, s) => sum + parseFloat(s.distance), 0)
    const remTime = stops.reduce((sum, s) => sum + parseInt(s.time), 0)
    setDistanceRemaining(`${remDist.toFixed(1)} km`)
    setTimeRemaining(`${remTime} min`)
    if (turnInstructions.length > 0) setNextTurn(turnInstructions[0])
    const arrival = new Date(Date.now() + remTime * 60000)
    setArrivingIn(arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    startDrivingAnimation()
  }

  const handleExit = () => {
    stopDrivingAnimation()
    setIsNavigating(false)
    setNextTurn(null)
    setCurrentSpeed(0)
    setAnimationProgress(0)
    mapRef.current?.flyTo({ center: [warehouseLng, warehouseLat], zoom: 14, pitch: 45, bearing: 0, duration: 1500 })
    onExit?.()
  }

  const getTurnIcon = (maneuver: string, modifier?: string) => {
    if (maneuver === 'turn') {
      if (modifier === 'left') return <Icons.TurnLeft />
      if (modifier === 'right') return <Icons.TurnRight />
    }
    if (maneuver === 'arrive') return <Icons.Arrive />
    return <Icons.Continue />
  }

  // Compute progress width as a CSS variable
  const progressWidth = `${animationProgress * 100}%`

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className={`relative w-full h-full ${nightMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Loading */}
      {isLoading && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center z-10 ${nightMode ? 'bg-gray-900' : 'bg-gray-100'}`} role="status">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4" />
          <div className={`font-medium ${nightMode ? 'text-white' : 'text-gray-600'}`}>Loading 3D Navigation...</div>
          <div className="text-sm text-gray-400 mt-1">ESRI Satellite + OpenFreeMap Buildings</div>
        </div>
      )}

      {/* Route Loading */}
      {isLoadingRoute && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-30">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            <span className="text-sm font-medium">Calculating route...</span>
          </div>
        </div>
      )}

      {/* Error */}
      {loadError && (
        <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center z-10" role="alert">
          <div className="text-red-500 text-lg font-medium mb-2">Map Error</div>
          <div className="text-gray-600 text-sm mb-4">{loadError}</div>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium">Refresh</button>
        </div>
      )}

      {/* Navigation UI */}
      {!isLoading && !loadError && (
        <>
          {/* Top Bar */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
            <button
              onClick={handleExit}
              aria-label="Close navigation and return to map"
              title="Close navigation"
              className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center ${nightMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-white hover:bg-gray-50 text-gray-600'}`}
            >
              <Icons.Close />
              <span className="sr-only">Close</span>
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => setShow3DSettings(!show3DSettings)}
                aria-label={show3DSettings ? 'Hide 3D settings' : 'Show 3D settings'}
                title="3D Settings"
                className={`px-3 py-1.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-1.5 ${showBuildings ? 'bg-blue-500 text-white' : nightMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-700'}`}
              >
                <Icons.Building /> 3D
              </button>
              <button
                onClick={() => setIsNightMode(!nightMode)}
                aria-label={nightMode ? 'Switch to day mode' : 'Switch to night mode'}
                title={nightMode ? 'Switch to Day' : 'Switch to Night'}
                className={`px-3 py-1.5 rounded-lg shadow-lg text-xs font-medium ${nightMode ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-white'}`}
              >
                {nightMode ? 'Day' : 'Night'}
              </button>
            </div>
          </div>

          {/* 3D Settings */}
          {show3DSettings && (
            <div className={`absolute top-16 right-4 p-3 rounded-xl shadow-xl z-20 w-56 ${nightMode ? 'bg-gray-800/95' : 'bg-white/95'} backdrop-blur-md`}>
              <div className={`text-xs font-semibold mb-2 ${nightMode ? 'text-white' : 'text-gray-800'}`}>3D Settings</div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="buildings-toggle" className={`text-[10px] ${nightMode ? 'text-gray-300' : 'text-gray-600'}`}>Show Buildings</label>
                <button
                  id="buildings-toggle"
                  onClick={() => setShowBuildings(!showBuildings)}
                  aria-label={showBuildings ? 'Hide buildings' : 'Show buildings'}
                  title={showBuildings ? 'Hide buildings' : 'Show buildings'}
                  className={`w-8 h-4 rounded-full ${showBuildings ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${showBuildings ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="mb-1">
                <label htmlFor="opacity-slider" className={`text-[10px] mb-0.5 block ${nightMode ? 'text-gray-300' : 'text-gray-600'}`}>Opacity: {Math.round(buildingOpacity * 100)}%</label>
                <input
                  id="opacity-slider"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={buildingOpacity}
                  onChange={(e) => setBuildingOpacity(parseFloat(e.target.value))}
                  aria-label="Building opacity"
                  title="Adjust building opacity"
                  className="w-full h-1 rounded-full appearance-none bg-gray-200 accent-blue-500"
                />
              </div>
            </div>
          )}

          {/* Turn Instruction */}
          {isNavigating && nextTurn && (
            <div className={`absolute ${show3DSettings ? 'top-32' : 'top-16'} left-4 right-4 z-20`}>
              <div className={`${nightMode ? 'bg-gray-800/95' : 'bg-white/95'} backdrop-blur-md rounded-2xl shadow-xl p-3`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-white flex-shrink-0" aria-hidden="true">
                    {getTurnIcon(nextTurn.maneuver, nextTurn.modifier)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${nightMode ? 'text-white' : 'text-gray-900'}`}>{nextTurn.instruction || 'Continue'}</div>
                    <div className={`text-xs mt-0.5 ${nightMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {nextTurn.distance > 1000 ? `${(nextTurn.distance / 1000).toFixed(1)} km` : `${Math.round(nextTurn.distance)} m`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Speed + Street */}
          {isNavigating && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <div className="flex items-center gap-2">
                {currentStreet && <div className="px-2 py-1 bg-black/80 text-white rounded-full text-xs font-medium backdrop-blur-md">{currentStreet}</div>}
                {currentSpeed > 0 && (
                  <div className="flex flex-col items-center px-2 py-1 bg-blue-500 text-white rounded-xl">
                    <span className="text-base font-bold leading-tight">{currentSpeed}</span>
                    <span className="text-[8px] font-medium opacity-80">km/h</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Traffic */}
          {isNavigating && trafficData.congestionLevel !== 'low' && (
            <div className={`absolute ${nextTurn ? (show3DSettings ? 'top-48' : 'top-32') : (show3DSettings ? 'top-32' : 'top-16')} left-4 z-20`}>
              <div className={`px-2 py-1.5 rounded-xl text-[10px] font-medium flex items-center gap-1.5 ${
                trafficData.congestionLevel === 'severe' ? 'bg-red-500 text-white' :
                trafficData.congestionLevel === 'heavy' ? 'bg-orange-500 text-white' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true"/>
                {trafficData.congestionLevel.charAt(0).toUpperCase() + trafficData.congestionLevel.slice(1)} traffic
                {trafficData.delayMinutes > 0 && ` (+${trafficData.delayMinutes} min)`}
              </div>
            </div>
          )}

          {/* Bottom Navigation Panel */}
          {isNavigating && (
            <div className="absolute bottom-0 left-0 right-0 z-20">
              <div className="h-1 bg-gray-200">
                <div className="nav-progress-bar h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300" style={{ width: progressWidth }} role="progressbar" aria-valuenow={Math.round(animationProgress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Navigation progress" />
              </div>
              <div className={`${nightMode ? 'bg-gray-800/95' : 'bg-white/95'} backdrop-blur-md p-3`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`text-xl font-bold ${nightMode ? 'text-white' : 'text-gray-900'}`}>{distanceRemaining}</div>
                    <div className={`text-xs ${nightMode ? 'text-gray-400' : 'text-gray-500'}`}>ETA {arrivingIn} &bull; {timeRemaining}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={isAnimating ? stopDrivingAnimation : startDrivingAnimation}
                      aria-label={isAnimating ? 'Pause navigation' : 'Resume navigation'}
                      title={isAnimating ? 'Pause' : 'Play'}
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-white ${isAnimating ? 'bg-blue-500' : 'bg-green-500'}`}
                    >
                      {isAnimating ? <Icons.Pause /> : <Icons.Play />}
                    </button>
                    <button
                      onClick={handleExit}
                      aria-label="Stop navigation and exit"
                      title="Stop navigation"
                      className="w-11 h-11 rounded-full bg-red-500 text-white flex items-center justify-center"
                    >
                      <Icons.Close />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Start Navigation Panel */}
          {!isNavigating && routeCoordinates.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 z-20">
              <div className={`${nightMode ? 'bg-gray-800/95' : 'bg-white/95'} backdrop-blur-md rounded-t-2xl shadow-xl`}>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className={`text-2xl font-bold ${nightMode ? 'text-white' : 'text-gray-900'}`}>{(totalDistance / 1000).toFixed(1)} km</div>
                      <div className={`text-sm ${nightMode ? 'text-gray-400' : 'text-gray-500'}`}>~{totalTime} min &bull; {stops.length} stops</div>
                    </div>
                    <div className="flex items-center gap-1" aria-hidden="true">
                      <Icons.Building />
                      <span className={`text-xs ${nightMode ? 'text-gray-300' : 'text-gray-600'}`}>3D Active</span>
                    </div>
                  </div>
                  <button onClick={handleStartNavigation} className="w-full py-3 bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-600">
                    <Icons.Play /> Start 3D Navigation
                  </button>
                </div>
                <div className="border-t max-h-28 overflow-y-auto">
                  {stops.slice(0, 4).map((stop) => (
                    <div key={stop.delivery.id} className="flex items-center gap-2 px-3 py-1.5">
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">{stop.order}</div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-sm truncate ${nightMode ? 'text-white' : 'text-gray-900'}`}>{stop.delivery.shopName}</div>
                        <div className={`text-xs ${nightMode ? 'text-gray-400' : 'text-gray-500'}`}>{stop.delivery.location}</div>
                      </div>
                    </div>
                  ))}
                  {stops.length > 4 && <div className={`px-3 py-1.5 text-xs text-center ${nightMode ? 'text-gray-500' : 'text-gray-400'}`}>+{stops.length - 4} more</div>}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <style jsx global>{`
        .maplibregl-ctrl-attribution { display: none; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px; height: 12px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .nav-marker-warehouse {
          width: 48px; height: 48px; border-radius: 50%;
          background: linear-gradient(135deg, #34a853, #0d9c38);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(52,168,83,0.5);
          border: 4px solid white;
        }
        .nav-marker-stop {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          border: 3px solid white;
        }
        .nav-marker-stop span {
          color: white; font-size: 14px; font-weight: 700;
        }
        .nav-marker-vehicle {
          width: 28px; height: 28px;
          background: linear-gradient(135deg, #4285f4, #1a73e8);
          border-radius: 50%; border: 4px solid white;
          box-shadow: 0 2px 12px rgba(66,133,244,0.6);
        }
      `}</style>
    </div>
  )
}
