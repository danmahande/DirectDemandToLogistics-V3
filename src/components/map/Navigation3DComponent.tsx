'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getTileEnhancer, type AIQualityLevel, type AIEnhancementMode } from '@/lib/ai-tile-enhancer'
import aiTileGenerationService, { type EnhancementStatus } from '@/services/aiTileGenerationService'
import { getMapLibreStyle } from '@/components/map/TileLayerConfig'
import { DEFAULT_SATELLITE_SOURCE, POI_MARKERS } from '@/lib/config'
import NavigationControls from '@/components/map/NavigationUI/NavigationControls'
import TurnByTurnPanel from '@/components/map/NavigationUI/TurnByTurnPanel'
import SpeedPanel from '@/components/map/NavigationUI/SpeedPanel'
import ArrivedModal from '@/components/map/NavigationUI/ArrivedModal'
import type { Navigation3DProps, TurnInstruction, POIMarker, TrafficData } from '@/types/map'

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
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationProgress, setAnimationProgress] = useState(0)
  const [useEnhancedTiles, setUseEnhancedTiles] = useState(true)
  const [aiQuality, setAiQuality] = useState<AIQualityLevel>('high')
  const [aiMode, setAiMode] = useState<AIEnhancementMode>('enhanced-satellite')
  const [aiEnhancementStatus, setAiEnhancementStatus] = useState<'idle' | 'enhancing' | 'ready'>('idle')
  const [enhancementStats, setEnhancementStats] = useState<EnhancementStatus | null>(null)
  const [hasArrived, setHasArrived] = useState(false)
  const [speedMultiplier, setSpeedMultiplier] = useState(1)

  // Animation state
  const animationStateRef = useRef({
    isRunning: false,
    currentIndex: 0,
    progress: 0,
    speed: 0.0003
  })

  // Traffic state
  const [trafficData, setTrafficData] = useState<TrafficData>({
    congestionLevel: 'low',
    delayMinutes: 0,
    incidents: 0,
    lastUpdated: null
  })

  // Camera state
  const userInteractingRef = useRef(false)
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const cameraFollowRef = useRef(true)
  const [cameraFollowEnabled, setCameraFollowEnabled] = useState(true)

  // Calculate totals
  const totalDistance = stops.reduce((sum, stop) => sum + parseFloat(stop.distance), 0)
  const totalTime = stops.reduce((sum, stop) => sum + parseInt(stop.time), 0)

  // ============================================
  // INITIALIZE AI TILE ENHANCER
  // ============================================

  useEffect(() => {
    const enhancer = aiTileGenerationService.init({
      enabled: useEnhancedTiles,
      quality: aiQuality,
      mode: aiMode,
      region: 'Kampala, Uganda',
      tileSourceUrl: DEFAULT_SATELLITE_SOURCE.url
    })
    aiEnhancerRef.current = enhancer

    const unsubscribe = aiTileGenerationService.onStatusChange((status) => {
      setEnhancementStats(status)
      setAiEnhancementStatus(status.isEnhancing ? 'enhancing' : 'ready')
    })

    return () => {
      unsubscribe()
      aiTileGenerationService.destroy()
    }
  }, [])

  // Update AI enhancement settings
  useEffect(() => {
    if (aiEnhancerRef.current) {
      aiEnhancerRef.current.setAIEnabled(useEnhancedTiles)
      aiEnhancerRef.current.setAIQuality(aiQuality)
      aiEnhancerRef.current.setAIMode(aiMode)
    }
  }, [useEnhancedTiles, aiQuality, aiMode])

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
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5
    const isMorningRush = hour >= 7 && hour <= 9
    const isEveningRush = hour >= 17 && hour <= 20

    let congestionLevel: 'low' | 'moderate' | 'heavy' | 'severe' = 'low'
    let delayMinutes = 0

    if (isWeekday && (isMorningRush || isEveningRush)) {
      congestionLevel = 'heavy'
      delayMinutes = Math.floor(Math.random() * 20) + 10
    } else if (isWeekday && ((hour >= 6 && hour <= 10) || (hour >= 16 && hour <= 21))) {
      congestionLevel = 'moderate'
      delayMinutes = Math.floor(Math.random() * 10) + 5
    } else {
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

      if (!response.ok) throw new Error(`OSRM API error: ${response.status}`)

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
  // REVERSE GEOCODING
  // ============================================

  const getStreetName = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: { 'User-Agent': 'DirectDDL-Navigation/5.0' },
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

      let currentIndex = animationStateRef.current.currentIndex
      let progress = animationStateRef.current.progress
      currentIndex = Math.max(0, Math.min(currentIndex, coords.length - 2))

      const startCoord = coords[currentIndex]
      const endCoord = coords[currentIndex + 1]

      if (!startCoord || !endCoord) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      const lng = startCoord[0] + (endCoord[0] - startCoord[0]) * progress
      const lat = startCoord[1] + (endCoord[1] - startCoord[1]) * progress

      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      vehicleMarkerRef.current.setLngLat([lng, lat])

      const dLng = endCoord[0] - startCoord[0]
      const dLat = endCoord[1] - startCoord[1]
      const bearing = Math.atan2(dLng, dLat) * (180 / Math.PI)

      if (cameraFollowRef.current && !userInteractingRef.current) {
        mapRef.current.jumpTo({
          center: [lng, lat],
          zoom: 17,
          pitch: 70,
          bearing: bearing
        })
      }

      const totalProgress = (currentIndex + progress) / (coords.length - 1)
      setAnimationProgress(totalProgress)
      setCurrentSpeed(Math.floor(25 + Math.random() * 35))

      const speed = animationStateRef.current.speed * speedMultiplier
      progress += speed

      if (progress >= 1) {
        progress = 0
        currentIndex++

        if (currentIndex >= coords.length - 1) {
          stopDrivingAnimation()
          setIsNavigating(false)
          setHasArrived(true)
          onComplete?.()
          return
        }

        animationStateRef.current.currentIndex = currentIndex
      }

      animationStateRef.current.progress = progress
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [routeCoordinates, onComplete, speedMultiplier])

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
  // INITIALIZE MAP
  // ============================================

  useEffect(() => {
    if (isInitializedRef.current || !mapContainerRef.current) return

    isInitializedRef.current = true
    let mounted = true

    const initMap = async () => {
      try {
        const hour = new Date().getHours()
        const nightMode = hour < 6 || hour >= 19
        if (mounted) setIsNightMode(nightMode)

        // Get the AI-enhanced tile URL
        const enhancer = aiEnhancerRef.current || getTileEnhancer({
          enabled: useEnhancedTiles,
          quality: aiQuality,
          mode: aiMode,
          region: 'Kampala, Uganda',
          tileSourceUrl: DEFAULT_SATELLITE_SOURCE.url
        })
        aiEnhancerRef.current = enhancer

        // Use centralized tile layer config
        const mapStyle = getMapLibreStyle({
          nightMode,
          useEnhancedTiles,
          quality: aiQuality,
          mode: aiMode
        })

        const map = new maplibregl.Map({
          container: mapContainerRef.current!,
          style: mapStyle as maplibregl.StyleSpecification,
          center: [warehouseLng, warehouseLat],
          zoom: 15,
          pitch: 60,
          bearing: 0,
          maxZoom: 18,
          minZoom: 10,
          maxPitch: 85
        })

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), 'bottom-right')
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left')

        // Track user interaction
        const handleUserInteraction = () => {
          userInteractingRef.current = true
          if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current)
          interactionTimeoutRef.current = setTimeout(() => { userInteractingRef.current = false }, 3000)
        }
        map.on('mousedown', handleUserInteraction)
        map.on('touchstart', handleUserInteraction)
        map.on('wheel', handleUserInteraction)
        map.on('dragstart', handleUserInteraction)

        map.on('load', async () => {
          if (!mounted) return

          setIsLoading(false)
          setLoadError(null)
          isMapReadyRef.current = true

          // Build and fetch route
          const coords: [number, number][] = [[warehouseLng, warehouseLat]]
          stops.forEach(stop => coords.push([stop.delivery.lng, stop.delivery.lat]))

          setIsLoadingRoute(true)
          const { coords: roadCoords, instructions } = await fetchRoadRoute(coords)
          setIsLoadingRoute(false)

          if (!mounted) return
          setRouteCoordinates(roadCoords)
          setTurnInstructions(instructions)

          // Add route line
          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: roadCoords } }
          })

          map.addLayer({ id: 'route-shadow', type: 'line', source: 'route', paint: { 'line-color': '#000000', 'line-width': 14, 'line-opacity': 0.3, 'line-blur': 8 } })
          map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8 } })
          map.addLayer({
            id: 'route-fill', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#4285f4', 'line-width': 4,
              'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#4285f4', 0.5, '#34a853', 1, '#ea4335']
            }
          })

          if (instructions.length > 0) setNextTurn(instructions[0])

          // Markers
          const startEl = document.createElement('div')
          startEl.className = 'marker start-marker'
          startEl.innerHTML = `<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#34a853,#0d9c38);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(52,168,83,0.5);border:4px solid white;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`
          new maplibregl.Marker({ element: startEl }).setLngLat([warehouseLng, warehouseLat]).addTo(map)

          stops.forEach((stop, index) => {
            const isLast = index === stops.length - 1
            const bgColor = isLast ? '#ea4335' : '#4285f4'
            const el = document.createElement('div')
            el.className = 'marker stop-marker'
            el.innerHTML = `<div style="width:36px;height:36px;border-radius:50%;background:${bgColor};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px ${bgColor}66;border:3px solid white;"><span style="color:white;font-size:14px;font-weight:700;">${stop.order}</span></div>`
            new maplibregl.Marker({ element: el }).setLngLat([stop.delivery.lng, stop.delivery.lat]).addTo(map)
          })

          // Vehicle puck
          const vehicleEl = document.createElement('div')
          vehicleEl.className = 'vehicle-puck'
          vehicleEl.innerHTML = `<div style="width:28px;height:28px;background:linear-gradient(135deg,#4285f4,#1a73e8);border-radius:50%;border:4px solid white;box-shadow:0 2px 12px rgba(66,133,244,0.6),0 0 20px rgba(66,133,244,0.4);"><svg width="28" height="28" viewBox="0 0 24 24" fill="white" style="transform:rotate(0deg)"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg></div>`
          const vehicleMarker = new maplibregl.Marker({ element: vehicleEl }).setLngLat([warehouseLng, warehouseLat]).addTo(map)
          vehicleMarkerRef.current = vehicleMarker

          const streetName = await getStreetName(warehouseLat, warehouseLng)
          if (mounted) setCurrentStreet(streetName)

          if (roadCoords.length > 0) {
            const bounds = new maplibregl.LngLatBounds()
            roadCoords.forEach(coord => bounds.extend(coord as [number, number]))
            map.fitBounds(bounds, { padding: 100, pitch: 60, duration: 1500 })
          }

          // Prefetch tiles
          if (enhancer.isProtocolRegistered() && useEnhancedTiles) {
            const center = map.getCenter()
            const zoom = Math.round(map.getZoom())
            const n = Math.pow(2, zoom)
            const x = Math.floor((center.lng + 180) / 360 * n)
            const latRad = center.lat * Math.PI / 180
            const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
            enhancer.prefetchTiles(zoom, x, y, 2)
          }
        })

        map.on('error', (e) => console.warn('Map error (non-critical):', e))
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
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (speedIntervalRef.current) clearInterval(speedIntervalRef.current)
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        isMapReadyRef.current = false
      }
      isInitializedRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // NAVIGATION HANDLERS
  // ============================================

  const handleStartNavigation = () => {
    setIsNavigating(true)
    onStart?.()
    const remainingDist = stops.reduce((sum, s) => sum + parseFloat(s.distance), 0)
    const remainingTime = stops.reduce((sum, s) => sum + parseInt(s.time), 0)
    setDistanceRemaining(`${remainingDist.toFixed(1)} km`)
    setTimeRemaining(`${remainingTime} min`)
    if (turnInstructions.length > 0) setNextTurn(turnInstructions[0])
    const arrival = new Date(Date.now() + remainingTime * 60000)
    setArrivingIn(arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    startDrivingAnimation()
  }

  const handleExit = () => {
    stopDrivingAnimation()
    setIsNavigating(false)
    setHasArrived(false)
    setNextTurn(null)
    setCurrentSpeed(0)
    setAnimationProgress(0)
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [warehouseLng, warehouseLat], zoom: 14, pitch: 45, bearing: 0, duration: 1500 })
    }
    onExit?.()
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
          <div className="text-sm mt-2 text-gray-400">
            {useEnhancedTiles ? 'Preparing photorealistic satellite imagery with AI enhancement' : 'Loading satellite imagery'}
          </div>
          {useEnhancedTiles && (
            <div className="flex items-center gap-2 mt-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
              </svg>
              <span className="text-xs text-purple-400">AI Enhancement Active</span>
            </div>
          )}
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
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Refresh Page</button>
        </div>
      )}

      {/* Navigation UI */}
      {!isLoading && !loadError && (
        <>
          {/* Top Bar Controls */}
          <NavigationControls
            isNightMode={isNightMode}
            useEnhancedTiles={useEnhancedTiles}
            aiQuality={aiQuality}
            aiMode={aiMode}
            isEnhancing={aiEnhancementStatus === 'enhancing'}
            showTraffic={showTraffic}
            showPOIs={showPOIs}
            stats={enhancementStats?.enhancerStats ? {
              aiHits: enhancementStats.enhancerStats.aiHits,
              canvasHits: enhancementStats.enhancerStats.canvasHits,
              webglHits: enhancementStats.enhancerStats.webglHits,
              queueLength: enhancementStats.enhancerStats.queueLength,
              activeRequests: enhancementStats.enhancerStats.activeRequests
            } : undefined}
            onExit={handleExit}
            onToggleEnhancement={setUseEnhancedTiles}
            onQualityChange={setAiQuality}
            onModeChange={setAiMode}
            onToggleTraffic={() => setShowTraffic(!showTraffic)}
            onTogglePOIs={() => setShowPOIs(!showPOIs)}
          />

          {/* Turn-by-Turn Panel */}
          {isNavigating && (
            <TurnByTurnPanel
              isNightMode={isNightMode}
              currentStreet={currentStreet}
              nextTurn={nextTurn}
              distanceRemaining={distanceRemaining}
              timeRemaining={timeRemaining}
              arrivingIn={arrivingIn}
              turnInstructions={turnInstructions}
              showInstructions={showInstructions}
              onToggleInstructions={() => setShowInstructions(!showInstructions)}
            />
          )}

          {/* Speed Panel */}
          <SpeedPanel
            isNightMode={isNightMode}
            currentSpeed={currentSpeed}
            isAnimating={isAnimating}
            animationProgress={animationProgress}
            isNavigating={isNavigating}
            speedMultiplier={speedMultiplier}
            onToggleAnimation={toggleAnimation}
            onSpeedChange={setSpeedMultiplier}
            onStartNavigation={handleStartNavigation}
          />

          {/* Start Navigation Button (when not navigating) */}
          {!isNavigating && !hasArrived && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
              <button
                onClick={handleStartNavigation}
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl shadow-lg hover:from-blue-600 hover:to-blue-700 transition-all font-semibold text-lg flex items-center gap-3"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Start Navigation
              </button>
            </div>
          )}

          {/* Arrived Modal */}
          {hasArrived && (
            <ArrivedModal
              isNightMode={isNightMode}
              stopName={stops[stops.length - 1]?.delivery?.shopName || 'Destination'}
              stopOrder={stops.length}
              totalStops={stops.length}
              distanceTraveled={`${totalDistance.toFixed(1)} km`}
              timeElapsed={`${totalTime} min`}
              onClose={handleExit}
              onExit={handleExit}
            />
          )}
        </>
      )}
    </div>
  )
}
