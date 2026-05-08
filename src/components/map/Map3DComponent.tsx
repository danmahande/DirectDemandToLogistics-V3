'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { formatDistance, formatDuration } from '@/services/routingService'
import {
  build3DMapStyle,
  DEFAULT_MAP_CONFIG,
  DEFAULT_3D_CAMERA,
  KAMPALA_BOUNDS,
  type MapStyleConfig,
} from '@/lib/tile-sources'

// ============================================
// TYPES
// ============================================

interface Delivery {
  id: number
  shopName: string
  location: string
  lat: number
  lng: number
}

interface RouteStop {
  order: number
  delivery: Delivery
  distance: string
  time: string
}

interface Map3DComponentProps {
  optimizedRoute?: RouteStop[]
  onClose: () => void
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function Map3DComponent({
  optimizedRoute = [],
  onClose
}: Map3DComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const animationRef = useRef<number | null>(null)
  const initializedRef = useRef(false)

  const [isNavigating, setIsNavigating] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [hasArrived, setHasArrived] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showSpeedOptions, setShowSpeedOptions] = useState(false)
  const [speed, setSpeed] = useState(1)

  const [totalDistance, setTotalDistance] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [remainingDistance, setRemainingDistance] = useState(0)
  const [remainingDuration, setRemainingDuration] = useState(0)
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [currentRoad, setCurrentRoad] = useState('')
  const [progress, setProgress] = useState(0)

  // NEW: Map style configuration state
  const [mapConfig, setMapConfig] = useState<MapStyleConfig>(DEFAULT_MAP_CONFIG)
  const [showSettings, setShowSettings] = useState(false)

  const warehouseLat = 0.3152
  const warehouseLng = 32.5814

  // ============================================
  // MAP STYLE UPDATE (when config changes)
  // ============================================

  const updateMapStyle = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    // Rebuild and apply the style
    const newStyle = build3DMapStyle(mapConfig)
    map.setStyle(newStyle)

    // Re-add route layer after style loads
    map.once('style.load', () => {
      if (routeCoords.length > 1) {
        addRouteToMap(map)
      }
    })
  }, [mapConfig, routeCoords])

  // Update building opacity live without full style rebuild
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try {
      if (map.getLayer('3d-buildings')) {
        map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', mapConfig.showBuildings ? mapConfig.buildingOpacity : 0)
      }
    } catch {
      // Layer may not exist yet
    }
  }, [mapConfig.buildingOpacity, mapConfig.showBuildings])

  // ============================================
  // INITIALIZE 3D MAP
  // ============================================

  useEffect(() => {
    if (!mapContainerRef.current || initializedRef.current) return
    initializedRef.current = true

    const mapStyle = build3DMapStyle(mapConfig)

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: DEFAULT_3D_CAMERA.center,
      zoom: DEFAULT_3D_CAMERA.zoom,
      pitch: DEFAULT_3D_CAMERA.pitch,
      bearing: DEFAULT_3D_CAMERA.bearing,
      maxPitch: DEFAULT_3D_CAMERA.maxPitch,
      minZoom: DEFAULT_3D_CAMERA.minZoom,
      maxZoom: DEFAULT_3D_CAMERA.maxZoom,
      // NEW: Restrict to Kampala area
      maxBounds: KAMPALA_BOUNDS,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left')

    // NEW: Add terrain control (for future elevation data)
    // map.addControl(new maplibregl.TerrainControl({ source: 'terrain' }), 'top-right')

    map.on('load', () => {
      setIsLoading(false)
      console.log('3D Map loaded — ESRI Satellite + OpenFreeMap Buildings + Sky')
    })

    map.on('error', (e) => {
      console.warn('Map error (non-critical):', e)
      setIsLoading(false)
    })

    mapRef.current = map

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      markerRef.current?.remove()
      map.remove()
      mapRef.current = null
      initializedRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // ADD ROUTE TO MAP (extracted for reuse)
  // ============================================

  const addRouteToMap = useCallback((map: maplibregl.Map) => {
    try {
      // Remove existing layers
      if (map.getLayer('route-line')) map.removeLayer('route-line')
      if (map.getLayer('route-outline')) map.removeLayer('route-outline')
      if (map.getLayer('route-shadow')) map.removeLayer('route-shadow')
      if (map.getSource('route')) map.removeSource('route')

      // Add route source
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: routeCoords }
        }
      })

      // NEW: Route shadow for depth effect
      map.addLayer({
        id: 'route-shadow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#000000',
          'line-width': 12,
          'line-opacity': 0.2,
          'line-blur': 6,
        }
      })

      // Route outline (white casing)
      map.addLayer({
        id: 'route-outline',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.8 }
      })

      // Route line (blue with gradient)
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#4285f4',
          'line-width': 5,
          // NEW: Gradient from green (start) to red (end)
          'line-gradient': [
            'interpolate', ['linear'], ['line-progress'],
            0, '#34a853',    // Green — start
            0.5, '#4285f4',  // Blue — midway
            1, '#ea4335',    // Red — destination
          ]
        }
      })

      // Fit bounds with padding
      const bounds = new maplibregl.LngLatBounds()
      routeCoords.forEach(c => bounds.extend(c))
      map.fitBounds(bounds, { padding: 100, pitch: 50, duration: 1500 })

      // Add stop markers
      optimizedRoute.forEach((stop) => {
        const isLast = stop.order === optimizedRoute.length
        const bgColor = isLast ? '#ea4335' : '#4285f4'
        const el = document.createElement('div')
        el.innerHTML = `
          <div style="width:28px;height:28px;background:${bgColor};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;box-shadow:0 2px 6px ${bgColor}66;">
            ${stop.order}
          </div>
        `
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([stop.delivery.lng, stop.delivery.lat])
          .addTo(map)
      })

      // Add start marker
      const startEl = document.createElement('div')
      startEl.innerHTML = `
        <div style="width:32px;height:32px;background:linear-gradient(135deg,#34a853,#0d9c38);border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:14px;box-shadow:0 2px 6px rgba(52,168,83,0.5);">
          S
        </div>
      `
      new maplibregl.Marker({ element: startEl, anchor: 'center' })
        .setLngLat([warehouseLng, warehouseLat])
        .addTo(map)

      // Navigation vehicle puck
      const navEl = document.createElement('div')
      navEl.innerHTML = `
        <svg viewBox="0 0 44 44" width="44" height="44" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">
          <circle cx="22" cy="22" r="18" fill="white" stroke="#4285f4" stroke-width="3"/>
          <circle cx="22" cy="22" r="12" fill="#4285f4"/>
          <polygon points="22,6 28,24 22,18 16,24" fill="white"/>
        </svg>
      `
      markerRef.current = new maplibregl.Marker({
        element: navEl,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map'
      })
        .setLngLat([warehouseLng, warehouseLat])
        .addTo(map)
    } catch (err) {
      console.error('Error adding route:', err)
    }
  }, [routeCoords, optimizedRoute, warehouseLat, warehouseLng])

  // ============================================
  // CALCULATE AND DISPLAY ROUTE
  // ============================================

  useEffect(() => {
    const map = mapRef.current
    if (!map || optimizedRoute.length === 0) return

    const coords: [number, number][] = [
      [warehouseLng, warehouseLat],
      ...optimizedRoute.map(stop => [stop.delivery.lng, stop.delivery.lat] as [number, number])
    ]

    // Haversine distance calculation
    let totalDist = 0
    for (let i = 1; i < coords.length; i++) {
      const R = 6371000
      const dLat = (coords[i][1] - coords[i-1][1]) * Math.PI / 180
      const dLng = (coords[i][0] - coords[i-1][0]) * Math.PI / 180
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(coords[i-1][1] * Math.PI / 180) * Math.cos(coords[i][1] * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2)
      totalDist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    }

    setRouteCoords(coords)
    setTotalDistance(totalDist)
    setTotalDuration(totalDist / 15)
    setRemainingDistance(totalDist)
    setRemainingDuration(totalDist / 15)

    if (map.isStyleLoaded()) {
      addRouteToMap(map)
    } else {
      map.on('load', () => addRouteToMap(map))
    }
  }, [optimizedRoute, addRouteToMap])

  // ============================================
  // NAVIGATION ANIMATION
  // ============================================

  const startNavigation = useCallback(() => {
    if (routeCoords.length < 2 || !mapRef.current || !markerRef.current) return

    setIsNavigating(true)

    let currentIndex = 0
    const totalPoints = routeCoords.length
    let lastTime = performance.now()

    const animate = (time: number) => {
      if (isPaused) {
        lastTime = time
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      const delta = (time - lastTime) / 1000
      lastTime = time

      const stepPerSecond = 0.5 * speed
      currentIndex += stepPerSecond * delta

      if (currentIndex >= totalPoints - 1) {
        setIsNavigating(false)
        setHasArrived(true)
        return
      }

      const i = Math.floor(currentIndex)
      const coord = routeCoords[Math.min(i, totalPoints - 1)]
      const nextCoord = routeCoords[Math.min(i + 1, totalPoints - 1)]

      if (markerRef.current && mapRef.current) {
        markerRef.current.setLngLat(coord)

        const bearing = Math.atan2(nextCoord[0] - coord[0], nextCoord[1] - coord[1]) * 180 / Math.PI
        markerRef.current.setRotation(bearing)

        mapRef.current.easeTo({
          center: coord,
          bearing: bearing,
          pitch: 70,
          zoom: 17,
          duration: 100
        })
      }

      const ratio = currentIndex / totalPoints
      setProgress(currentIndex)
      setRemainingDistance(totalDistance * (1 - ratio))
      setRemainingDuration(totalDuration * (1 - ratio))
      setCurrentRoad('Following route...')

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [routeCoords, speed, isPaused, totalDistance, totalDuration])

  const stopNavigation = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    setIsNavigating(false)
    setIsPaused(false)
  }, [])

  const togglePause = useCallback(() => setIsPaused(p => !p), [])

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="fixed inset-0 z-[100] bg-gray-100">
      {/* Map */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-700 font-medium text-lg">Loading 3D Map</p>
            <p className="text-gray-400 text-sm mt-1">ESRI Satellite + OpenFreeMap Buildings</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse [animation-delay:0.2s]" />
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse [animation-delay:0.4s]" />
            </div>
          </div>
        </div>
      )}

      {/* Arrived Modal */}
      {hasArrived && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30">
          <div className="bg-white rounded-2xl p-8 text-center mx-4 max-w-sm">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#34a853" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Arrived!</h2>
            <p className="text-gray-500 mb-6">{optimizedRoute[optimizedRoute.length - 1]?.delivery.shopName}</p>
            <button onClick={onClose} className="w-full px-6 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
        <button
          onClick={isNavigating ? stopNavigation : onClose}
          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center pointer-events-auto hover:bg-gray-50 transition-colors"
        >
          {isNavigating ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          )}
        </button>

        <div className="flex items-center gap-2">
          {/* NEW: Settings button */}
          {!isNavigating && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`px-3 py-2 bg-white rounded-lg shadow-lg text-xs font-medium flex items-center gap-1.5 pointer-events-auto transition-colors ${
                showSettings ? 'bg-blue-500 text-white' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
              </svg>
              3D
            </button>
          )}

          {isNavigating && (
            <div className="px-3 py-1.5 bg-green-500 text-white rounded-full text-sm font-medium flex items-center gap-1.5 pointer-events-auto">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"/>
              {isPaused ? 'Paused' : 'Navigating'}
            </div>
          )}

          {isNavigating && (
            <button
              onClick={() => setShowSpeedOptions(!showSpeedOptions)}
              className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-sm font-bold text-blue-600 pointer-events-auto"
            >
              {speed}x
            </button>
          )}
        </div>
      </div>

      {/* NEW: 3D Settings Panel */}
      {showSettings && !isNavigating && (
        <div className="absolute top-16 right-4 w-72 bg-white/95 backdrop-blur-md rounded-xl shadow-xl z-20 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">3D Map Settings</h3>
            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Building Height Exaggeration */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">Building Height</span>
              <span className="text-xs font-medium text-gray-900">{mapConfig.buildingHeightExaggeration.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={mapConfig.buildingHeightExaggeration}
              onChange={(e) => setMapConfig(c => ({ ...c, buildingHeightExaggeration: parseFloat(e.target.value) }))}
              className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-blue-500"
            />
          </div>

          {/* Building Opacity */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">Building Opacity</span>
              <span className="text-xs font-medium text-gray-900">{Math.round(mapConfig.buildingOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={mapConfig.buildingOpacity}
              onChange={(e) => setMapConfig(c => ({ ...c, buildingOpacity: parseFloat(e.target.value) }))}
              className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-blue-500"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-2 mb-3">
            {[
              { key: 'showBuildings' as const, label: '3D Buildings', color: 'blue' },
              { key: 'showRoads' as const, label: 'Roads', color: 'yellow' },
              { key: 'showWater' as const, label: 'Water', color: 'cyan' },
              { key: 'showLabels' as const, label: 'Labels', color: 'gray' },
              { key: 'showSky' as const, label: 'Sky', color: 'sky' },
            ].map(toggle => (
              <div key={toggle.key} className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{toggle.label}</span>
                <button
                  onClick={() => setMapConfig(c => ({ ...c, [toggle.key]: !c[toggle.key] }))}
                  className={`w-9 h-5 rounded-full transition-all ${mapConfig[toggle.key] ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${mapConfig[toggle.key] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>

          {/* Day/Night Toggle */}
          <button
            onClick={() => setMapConfig(c => ({ ...c, nightMode: !c.nightMode }))}
            className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
              mapConfig.nightMode
                ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            {mapConfig.nightMode ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                Switch to Day
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                Switch to Night
              </>
            )}
          </button>

          {/* Apply Button */}
          <button
            onClick={updateMapStyle}
            className="w-full mt-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors"
          >
            Apply Changes
          </button>
        </div>
      )}

      {/* Speed Menu */}
      {showSpeedOptions && (
        <div className="absolute right-4 top-16 bg-white rounded-lg shadow-lg overflow-hidden z-20">
          {[1, 2, 4, 8].map(s => (
            <button
              key={s}
              onClick={() => { setSpeed(s); setShowSpeedOptions(false) }}
              className={`w-full px-4 py-2 text-left text-sm ${speed === s ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-gray-50'}`}
            >
              {s}x Speed
            </button>
          ))}
        </div>
      )}

      {/* Road Name */}
      {isNavigating && currentRoad && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
          <div className="px-4 py-1.5 bg-black/80 text-white rounded-full text-sm font-medium backdrop-blur-md">
            {currentRoad}
          </div>
        </div>
      )}

      {/* Bottom Panel */}
      {!isLoading && routeCoords.length > 1 && !hasArrive && (
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <div className="bg-white rounded-t-2xl shadow-lg">
            {isNavigating ? (
              <>
                <div className="bg-blue-600 text-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center text-2xl">&#11014;</div>
                    <div>
                      <div className="text-2xl font-bold">{formatDistance(remainingDistance)}</div>
                      <div className="text-white/80 text-sm">Continue on route</div>
                    </div>
                  </div>
                </div>

                <div className="h-1 bg-gray-200">
                  <div className="h-full bg-gradient-to-r from-green-500 via-blue-500 to-red-500 transition-all duration-300" style={{ width: `${Math.min((progress / Math.max(routeCoords.length - 1, 1)) * 100, 100)}%` }} />
                </div>

                <div className="flex items-center justify-between p-3">
                  <div className="text-sm">
                    <span className="font-bold text-lg">{formatDistance(remainingDistance)}</span>
                    <span className="text-gray-400 ml-1">left</span>
                    <span className="text-gray-500 ml-3">
                      ETA {new Date(Date.now() + remainingDuration * 1000 / speed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <button
                    onClick={togglePause}
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${isPaused ? 'bg-green-500' : 'bg-blue-500'}`}
                  >
                    {isPaused ? (
                      <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21"/></svg>
                    ) : (
                      <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-4">
                  <div className="mb-3">
                    <div className="text-xl font-bold">{formatDistance(totalDistance)}</div>
                    <div className="text-gray-500 text-sm">{formatDuration(totalDuration)} &bull; {optimizedRoute.length} stops</div>
                  </div>
                  <button
                    onClick={startNavigation}
                    className="w-full py-3 bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-600 transition-colors"
                  >
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21"/></svg>
                    Start 3D Navigation
                  </button>
                </div>

                <div className="border-t max-h-28 overflow-y-auto">
                  {optimizedRoute.slice(0, 3).map((stop) => (
                    <div key={stop.delivery.id} className="flex items-center gap-3 px-4 py-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">{stop.order}</div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{stop.delivery.shopName}</div>
                        <div className="text-xs text-gray-500">{stop.delivery.location}</div>
                      </div>
                    </div>
                  ))}
                  {optimizedRoute.length > 3 && (
                    <div className="px-4 py-2 text-xs text-gray-400 text-center">+{optimizedRoute.length - 3} more stops</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .maplibregl-ctrl-attribution { display: none; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  )
}
