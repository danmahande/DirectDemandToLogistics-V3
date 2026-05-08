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
  fetchOSMBuildings,
  addOSMBuildingLayer,
  type MapStyleConfig
} from '@/lib/tile/sources'

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
  const [mapError, setMapError] = useState<string | null>(null)
  const [showSpeedOptions, setShowSpeedOptions] = useState(false)
  const [speed, setSpeed] = useState(1)

  const [totalDistance, setTotalDistance] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [remainingDistance, setRemainingDistance] = useState(0)
  const [remainingDuration, setRemainingDuration] = useState(0)
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [currentRoad, setCurrentRoad] = useState('')
  const [progress, setProgress] = useState(0)
  const [buildingCount, setBuildingCount] = useState(0)

  const warehouseLat = 0.3152
  const warehouseLng = 32.5814

  // Map style config state — FIXED: uses Google satellite by default
  const [mapConfig, setMapConfig] = useState<MapStyleConfig>({
    ...DEFAULT_MAP_CONFIG,
    satelliteSource: 'google',       // FIXED: Google = true-color
    buildingHeightExaggeration: 2.0, // FIXED: 2x height for Kampala sparse data
  })

  // Initialize map with 3D buildings and TRUE-COLOR satellite
  useEffect(() => {
    if (!mapContainerRef.current || initializedRef.current) return
    initializedRef.current = true

    // Build the complete 3D map style using the centralized builder
    // FIXED: Google Satellite (true-color), vibrant building colors, 2x height
    const mapStyle = build3DMapStyle(mapConfig)

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: [warehouseLng, warehouseLat],
      zoom: DEFAULT_3D_CAMERA.zoom,
      pitch: DEFAULT_3D_CAMERA.pitch,
      bearing: DEFAULT_3D_CAMERA.bearing,
      maxPitch: DEFAULT_3D_CAMERA.maxPitch,
      minZoom: DEFAULT_3D_CAMERA.minZoom,
      maxZoom: DEFAULT_3D_CAMERA.maxZoom
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    map.on('load', async () => {
      setIsLoading(false)
      setMapError(null)

      // FIXED: Load OSM Overpass buildings as a supplement
      // This ensures buildings are visible even if OpenFreeMap tiles are sparse for Kampala
      try {
        const bounds = map.getBounds()
        const osmBuildings = await fetchOSMBuildings({
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        })

        if (osmBuildings && osmBuildings.features.length > 0) {
          addOSMBuildingLayer(map, osmBuildings, mapConfig)
          setBuildingCount(osmBuildings.features.length)
          console.log(`[Map3D] Added ${osmBuildings.features.length} OSM buildings as supplement`)
        }
      } catch (err) {
        console.warn('[Map3D] OSM buildings supplement failed (non-critical):', err)
      }
    })

    map.on('error', (e) => {
      console.error('Map error:', e)
    })

    // Reload OSM buildings when view changes significantly
    let reloadTimeout: NodeJS.Timeout | null = null
    map.on('moveend', () => {
      if (reloadTimeout) clearTimeout(reloadTimeout)
      reloadTimeout = setTimeout(async () => {
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
            setBuildingCount(osmBuildings.features.length)
          }
        } catch {
          // Non-critical, ignore
        }
      }, 2000)
    })

    mapRef.current = map

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (reloadTimeout) clearTimeout(reloadTimeout)
      markerRef.current?.remove()
      map.remove()
      mapRef.current = null
      initializedRef.current = false
    }
  }, [])

  // Calculate and display route
  useEffect(() => {
    const map = mapRef.current
    if (!map || optimizedRoute.length === 0) return

    const coords: [number, number][] = [
      [warehouseLng, warehouseLat],
      ...optimizedRoute.map(stop => [stop.delivery.lng, stop.delivery.lat] as [number, number])
    ]

    // Calculate distance
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

    const addRouteLayer = () => {
      try {
        // Remove existing layers
        if (map.getLayer('route-line')) map.removeLayer('route-line')
        if (map.getLayer('route-outline')) map.removeLayer('route-outline')
        if (map.getSource('route')) map.removeSource('route')

        // Add route source
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords }
          }
        })

        // Route outline
        map.addLayer({
          id: 'route-outline',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 8 }
        })

        // Route line
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#4285f4', 'line-width': 5 }
        })

        // Fit bounds
        const bounds = new maplibregl.LngLatBounds()
        coords.forEach(c => bounds.extend(c))
        map.fitBounds(bounds, { padding: 100, pitch: 50, duration: 1500 })

        // Add stop markers
        optimizedRoute.forEach((stop) => {
          const el = document.createElement('div')
          el.innerHTML = `<div style="width:28px;height:28px;background:#4285f4;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${stop.order}</div>`
          new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([stop.delivery.lng, stop.delivery.lat])
            .addTo(map)
        })

        // Add start marker
        const startEl = document.createElement('div')
        startEl.innerHTML = `<div style="width:32px;height:32px;background:#10b981;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">S</div>`
        new maplibregl.Marker({ element: startEl, anchor: 'center' })
          .setLngLat([warehouseLng, warehouseLat])
          .addTo(map)

        // Add navigation arrow marker
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
    }

    if (map.isStyleLoaded()) {
      addRouteLayer()
    } else {
      map.on('load', addRouteLayer)
    }
  }, [optimizedRoute])

  // Navigation
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

        // Calculate bearing for direction
        const bearing = Math.atan2(nextCoord[0] - coord[0], nextCoord[1] - coord[1]) * 180 / Math.PI
        markerRef.current.setRotation(bearing)

        // Follow with 3D view
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

  return (
    <div className="fixed inset-0 z-[100] bg-gray-100">
      {/* Map */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-gray-600">Loading 3D map...</p>
            <p className="text-gray-400 text-xs mt-1">Google Satellite + OpenFreeMap 3D Buildings</p>
          </div>
        </div>
      )}

      {/* Building count indicator */}
      {buildingCount > 0 && !isLoading && (
        <div className="absolute top-4 right-16 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow text-xs text-gray-600 z-10">
          {buildingCount} buildings loaded
        </div>
      )}

      {/* Error notice */}
      {mapError && !isLoading && (
        <div className="absolute top-16 left-4 right-4 bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm">
          {mapError}
        </div>
      )}

      {/* Arrived */}
      {hasArrived && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 text-center mx-4">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-xl font-bold mb-2">Arrived!</h2>
            <p className="text-gray-500 mb-4">{optimizedRoute[optimizedRoute.length - 1]?.delivery.shopName}</p>
            <button onClick={onClose} className="px-5 py-2 bg-blue-500 text-white rounded-xl font-medium">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <button
          onClick={isNavigating ? stopNavigation : onClose}
          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center pointer-events-auto"
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

      {/* Speed Menu */}
      {showSpeedOptions && (
        <div className="absolute right-4 top-16 bg-white rounded-lg shadow-lg overflow-hidden z-10">
          {[1, 2, 4].map(s => (
            <button
              key={s}
              onClick={() => { setSpeed(s); setShowSpeedOptions(false) }}
              className={`w-full px-4 py-2 text-left text-sm ${speed === s ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
            >
              {s}x Speed
            </button>
          ))}
        </div>
      )}

      {/* Road Name */}
      {isNavigating && currentRoad && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2">
          <div className="px-3 py-1 bg-black/80 text-white rounded-full text-sm">
            {currentRoad}
          </div>
        </div>
      )}

      {/* Bottom Panel */}
      {!isLoading && routeCoords.length > 1 && !hasArrived && (
        <div className="absolute bottom-0 left-0 right-0">
          <div className="bg-white rounded-t-2xl shadow-lg">
            {isNavigating ? (
              <>
                <div className="bg-blue-600 text-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center text-2xl">⬆</div>
                    <div>
                      <div className="text-2xl font-bold">{formatDistance(remainingDistance)}</div>
                      <div className="text-white/80 text-sm">Continue on route</div>
                    </div>
                  </div>
                </div>

                <div className="h-1 bg-gray-200">
                  <div className="h-full bg-blue-500" style={{ width: `${Math.min((progress / Math.max(routeCoords.length - 1, 1)) * 100, 100)}%` }} />
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
                    <div className="text-gray-500 text-sm">{formatDuration(totalDuration)} • {optimizedRoute.length} stops</div>
                  </div>
                  <button
                    onClick={startNavigation}
                    className="w-full py-3 bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2"
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
      `}</style>
    </div>
  )
}
