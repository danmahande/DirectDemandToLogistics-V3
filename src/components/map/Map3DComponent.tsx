'use client'

/**
 * Map3DComponent - v5.4
 *
 * 3D map viewer using MapLibre GL with AI-enhanced satellite imagery.
 *
 * v5.4 — RESTORES THE AI PROTOCOL:
 * - Uses getMapLibreStyle({ useEnhancedTiles: true }) which activates the
 *   full 4-valve AI pipeline: MapLibre protocol → API route → ZAI VLM → ZAI Image Gen
 * - The protocol handler has built-in fallback to plain satellite tiles
 * - If ZAI is unavailable, tiles still render as plain ESRI satellite
 * - If ZAI is available, tiles are progressively enhanced: WebGL fast-path
 *   first (~5ms), then async AI generation replaces them (~2-8s)
 *
 * Architecture flow:
 *   1. getMapLibreStyle() calls getTileEnhancer() → registers ai-enhanced:// protocol
 *   2. Map loads with ai-enhanced://satellite/{z}/{x}/{y} tile URLs
 *   3. MapLibre intercepts tile requests via addProtocol
 *   4. Protocol handler: cache? → WebGL fast-path → queue AI generation
 *   5. If anything fails: fallback to direct ESRI satellite tile
 *
 * v5.2 fixes (carried forward):
 * - Button accessibility: aria-label + title on icon-only buttons
 * - Uses shared RouteStop type from @/types/map
 * - All SVG icons have aria-hidden="true"
 */

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapLibreStyle } from '@/components/map/TileLayerConfig'
import { WAREHOUSE_LOCATION } from '@/lib/config'
import type { RouteStop } from '@/types/map'

interface Map3DComponentProps {
  stops: RouteStop[]
  onExit?: () => void
}

export default function Map3DComponent({ stops, onExit }: Map3DComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const isInitializedRef = useRef(false)
  const [isLoading, setIsLoading] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    if (isInitializedRef.current || !mapContainerRef.current) return

    isInitializedRef.current = true
    let mounted = true

    const initMap = async () => {
      try {
        // ============================================
        // AI-ENHANCED SATELLITE STYLE
        // ============================================
        // getMapLibreStyle() calls getTileEnhancer() which:
        //   1. Creates the AITileEnhancer singleton
        //   2. Initializes cache (IndexedDB + in-memory)
        //   3. Registers `ai-enhanced://` protocol on maplibregl
        //   4. Returns tile URLs like: ai-enhanced://satellite/{z}/{x}/{y}
        //
        // When MapLibre loads these tiles, the protocol handler:
        //   - Checks cache → returns AI tile if available
        //   - Otherwise → applies WebGL/Canvas fast-path (~5-20ms)
        //   - Queues AI generation → replaces tile when ready
        //   - On ANY failure → falls back to direct ESRI satellite fetch
        //
        // This means: satellite ALWAYS renders. AI enhancement is
        // progressive — it makes tiles better over time.
        const style = getMapLibreStyle({
          nightMode: false,
          useEnhancedTiles: true
        })

        const map = new maplibregl.Map({
          container: mapContainerRef.current!,
          style: style as maplibregl.StyleSpecification,
          center: [WAREHOUSE_LOCATION.lng, WAREHOUSE_LOCATION.lat],
          zoom: 14,
          pitch: 60,
          bearing: 0,
          maxZoom: 18,
          minZoom: 10
        })

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left')

        map.on('load', () => {
          if (!mounted) return
          setIsLoading(false)

          // Add stop markers
          stops.forEach((stop, index) => {
            const el = document.createElement('div')
            const isLast = index === stops.length - 1
            const bgColor = isLast ? '#ea4335' : '#4285f4'
            el.innerHTML = `<div style="width:32px;height:32px;border-radius:50%;background:${bgColor};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px ${bgColor}66;border:3px solid white;"><span style="color:white;font-size:13px;font-weight:700;">${stop.order}</span></div>`
            new maplibregl.Marker({ element: el })
              .setLngLat([stop.delivery.lng, stop.delivery.lat])
              .addTo(map)
          })

          // Warehouse marker
          const startEl = document.createElement('div')
          startEl.innerHTML = `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#34a853,#0d9c38);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(52,168,83,0.4);border:3px solid white;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`
          new maplibregl.Marker({ element: startEl })
            .setLngLat([WAREHOUSE_LOCATION.lng, WAREHOUSE_LOCATION.lat])
            .addTo(map)

          // Draw route line
          if (stops.length >= 1) {
            const coords: [number, number][] = [[WAREHOUSE_LOCATION.lng, WAREHOUSE_LOCATION.lat]]
            stops.forEach(stop => coords.push([stop.delivery.lng, stop.delivery.lat]))

            map.addSource('route', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: coords }
              }
            })

            map.addLayer({
              id: 'route-line',
              type: 'line',
              source: 'route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#4285f4',
                'line-width': 4,
                'line-opacity': 0.8
              }
            })

            // Fit bounds
            const bounds = new maplibregl.LngLatBounds()
            coords.forEach(coord => bounds.extend(coord))
            map.fitBounds(bounds, { padding: 80, pitch: 60, duration: 1500 })
          }
        })

        map.on('error', (e) => {
          console.warn('3D Map error (non-critical):', e)
        })

        mapRef.current = map

      } catch (error) {
        console.error('3D Map initialization error:', error)
        if (mounted) {
          setMapError('Failed to initialize 3D map.')
          setIsLoading(false)
        }
      }
    }

    initMap()

    return () => {
      mounted = false
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      isInitializedRef.current = false
    }
  }, [stops])

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" aria-label="Loading 3D map">
            <span className="sr-only">Loading 3D map...</span>
          </div>
        </div>
      )}

      {/* Error */}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <div className="text-red-500">{mapError}</div>
        </div>
      )}

      {/* Back to 2D */}
      {onExit && (
        <button
          onClick={onExit}
          aria-label="Close 3D view and return to 2D map"
          title="Close 3D view"
          className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full shadow-lg bg-white hover:bg-gray-50 flex items-center justify-center transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  )
}
