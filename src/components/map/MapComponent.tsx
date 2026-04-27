'use client'

/**
 * MapComponent (2D) - v8.1 with ZAI AI Enhancement
 *
 * v8.1 fixes:
 * - Lightweight health check (GET /api/enhance-tile?health=1) instead of heavy POST
 * - mountIdRef guard prevents L.map() race condition on React 18 double-mount
 * - AITileLayer uses L.TileLayer.extend() cast for TypeScript compat
 * - quality=high added to buildTileUrl for consistent AI generation
 * - generate-tile proxy endpoint added (was empty)
 * - enhance-tile GET now proxies original tile instead of returning JSON
 * - VLM call uses createVision() instead of create()
 *
 * Tile flow:
 *   Low zoom (< 14):  Direct ESRI tiles (fast, no proxy)
 *   High zoom (>= 14): /api/enhance-tile?url=...&quality=high&mode=ai
 *     → checks AI cache → returns enhanced tile if available
 *     → otherwise proxies original tile + triggers AI generation
 *     → next load gets the AI-enhanced version from cache
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { WAREHOUSE_LOCATION } from '@/lib/config'
import type { Delivery, RegionStats, RouteStop } from '@/types/map'

// ============================================
// TYPES & CONSTANTS
// ============================================

type LeafletMap = import('leaflet').Map

const OVERVIEW_ZOOM = 13
const BUILDING_ZOOM = 18
const ZOOM_DURATION = 2.5

const ESRI_TILE_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const AI_ENHANCE_MIN_ZOOM = 14

interface MapComponentProps {
  deliveries: Delivery[]
  regions: RegionStats[]
  optimizedStops: RouteStop[]
  viewMode: '2d' | '3d'
  displayMode: 'deliveries' | 'regions' | 'route'
  onSwitchTo3D: () => void
  onSwitchTo2D: () => void
}

type EnhancementStatus = 'off' | 'checking' | 'proxy' | 'enhancing' | 'enhanced' | 'unavailable'

// ============================================
// HELPERS
// ============================================

function buildTileUrl(z: number, x: number, y: number): string {
  if (z < AI_ENHANCE_MIN_ZOOM) {
    return ESRI_TILE_TEMPLATE
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y))
  }

  const originalUrl = ESRI_TILE_TEMPLATE
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))

  return `/api/enhance-tile?url=${encodeURIComponent(originalUrl)}&z=${z}&x=${x}&y=${y}&quality=high&mode=ai`
}

async function checkZAIStatus(): Promise<'ready' | 'no-sdk' | 'error'> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch('/api/enhance-tile?health=1', {
      method: 'GET',
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const zaiHeader = response.headers.get('X-ZAI-Status') || ''
      console.log(`[MapComponent v8.1] ZAI health check: X-ZAI-Status=${zaiHeader}`)
      if (zaiHeader === 'available') {
        return 'ready'
      }
      console.warn('[MapComponent v8.1] ZAI SDK not available on server')
      return 'no-sdk'
    }

    console.warn(`[MapComponent v8.1] ZAI health check failed: ${response.status}`)
    return 'error'
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('[MapComponent v8.1] ZAI health check timed out (5s)')
    } else {
      console.warn('[MapComponent v8.1] ZAI health check network error:', err)
    }
    return 'error'
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function MapComponent({
  deliveries,
  regions,
  optimizedStops,
  viewMode,
  displayMode,
  onSwitchTo3D,
  onSwitchTo2D
}: MapComponentProps) {
  const mapRef = useRef<LeafletMap | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mountIdRef = useRef(0)
  const [isMapReady, setIsMapReady] = useState(false)
  const [enhancementStatus, setEnhancementStatus] = useState<EnhancementStatus>('off')
  const [aiTileCount, setAiTileCount] = useState(0)
  const [zaiError, setZaiError] = useState<string | null>(null)

  // Track enhancement results in a ref (avoids stale closures)
  const enhancementTracker = useRef({
    sent: 0,
    succeeded: 0,
    failed: 0,
    sentTiles: new Set<string>()
  })

  // ============================================
  // ZOOM TO BUILDINGS
  // ============================================

  const handleZoomToBuildings = useCallback(() => {
    if (!mapRef.current) return

    if (viewMode === '2d') {
      mapRef.current.flyTo(
        [WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng],
        BUILDING_ZOOM,
        { duration: ZOOM_DURATION, easeLinearity: 0.25 }
      )
      onSwitchTo3D()
    } else {
      mapRef.current.flyTo(
        [WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng],
        OVERVIEW_ZOOM,
        { duration: ZOOM_DURATION, easeLinearity: 0.25 }
      )
      onSwitchTo2D()
    }
  }, [viewMode, onSwitchTo3D, onSwitchTo2D])

  // ============================================
  // INITIALIZE MAP + ZAI CHECK
  // ============================================

  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) return

    const thisMountId = ++mountIdRef.current

    // React 18 Strict Mode double-mount guard:
    // If the container already has a Leaflet map (from the first mount),
    // remove it before creating a new one.
    const existingMap = mapRef.current
    if (existingMap) {
      existingMap.remove()
      mapRef.current = null
    }
    // Also clear any leftover Leaflet internal ID on the DOM element
    const leafletId = (container as unknown as Record<string, unknown>)._leaflet_id
    if (leafletId !== undefined) {
      delete (container as unknown as Record<string, unknown>)._leaflet_id
    }
    const leafletProp = (container as unknown as Record<string, unknown>)._leaflet
    if (leafletProp !== undefined) {
      delete (container as unknown as Record<string, unknown>)._leaflet
    }

    import('leaflet').then(async (L) => {
      // Double-check: if another mount beat us, bail out
      if (mountIdRef.current !== thisMountId) return

      // Inject Leaflet CSS
      const linkEl = document.createElement('link')
      linkEl.rel = 'stylesheet'
      linkEl.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      linkEl.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
      linkEl.crossOrigin = ''
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        document.head.appendChild(linkEl)
      }

      // ============================================
      // CHECK ZAI AVAILABILITY FIRST
      // ============================================
      setEnhancementStatus('checking')
      console.log('[MapComponent v8.1] Checking ZAI availability...')

      const zaiStatus = await checkZAIStatus()

      // Guard: if component unmounted/remounted during async check, bail
      if (mountIdRef.current !== thisMountId) return

      if (zaiStatus === 'no-sdk') {
        console.warn('[MapComponent v8.1] ZAI SDK not installed — using CSS-enhanced satellite only')
        setEnhancementStatus('unavailable')
        setZaiError('ZAI SDK not installed. Run: npm install z-ai-web-dev-sdk')
      } else if (zaiStatus === 'error') {
        console.warn('[MapComponent v8.1] ZAI endpoint error — using CSS-enhanced satellite only')
        setEnhancementStatus('unavailable')
        setZaiError('ZAI endpoint unreachable')
      } else {
        console.log('[MapComponent v8.1] ZAI is available — tiles will be AI-enhanced')
      }

      // Clean up leftover _leaflet_id and _leaflet on container before L.map()
      delete (container as unknown as Record<string, unknown>)._leaflet_id
      delete (container as unknown as Record<string, unknown>)._leaflet

      // Create map
      const map = L.map(container, {
        center: [WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng],
        zoom: OVERVIEW_ZOOM,
        zoomControl: true,
        maxZoom: 19,
        minZoom: 8
      })

      // ============================================
      // CUSTOM AI-PROXY TILE LAYER
      // ============================================

      const AITileLayer = L.TileLayer.extend({
        getTileUrl: function(coords: { x: number; y: number; z: number }): string {
          return buildTileUrl(coords.z, coords.x, coords.y)
        }
      }) as unknown as new (url: string, options: L.TileLayerOptions) => L.TileLayer

      const aiTileLayer = new AITileLayer('', {
        maxZoom: 19,
        attribution: '&copy; Esri &mdash; AI-Enhanced by DirectDDL',
        className: 'ai-enhanced-tiles'
      })

      aiTileLayer.addTo(map)

      // ============================================
      // TILE LOAD → TRACK + TRIGGER AI
      // ============================================

      aiTileLayer.on('tileload', (e: { tile: HTMLImageElement; coords: { z: number; x: number; y: number } }) => {
        const { coords } = e
        if (coords.z < AI_ENHANCE_MIN_ZOOM) return
        if (zaiStatus === 'no-sdk' || zaiStatus === 'error') return

        const tileKey = `${coords.z}/${coords.x}/${coords.y}`

        // Skip if already sent for this tile
        if (enhancementTracker.current.sentTiles.has(tileKey)) return
        enhancementTracker.current.sentTiles.add(tileKey)
        enhancementTracker.current.sent++

        // Update status
        if (enhancementStatus === 'checking' || enhancementStatus === 'off') {
          setEnhancementStatus('proxy')
        }

        console.log(`[MapComponent v8.1] Triggering AI enhancement for tile ${tileKey}`)

        // Trigger AI generation and TRACK the result
        const originalUrl = ESRI_TILE_TEMPLATE
          .replace('{z}', String(coords.z))
          .replace('{x}', String(coords.x))
          .replace('{y}', String(coords.y))

        fetch('/api/generate-tile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            z: coords.z,
            x: coords.x,
            y: coords.y,
            originalUrl,
            quality: 'high',
            mode: 'enhanced-satellite',
            region: 'Kampala, Uganda'
          })
        })
          .then(async (response) => {
            const enhanced = response.headers.get('X-Enhanced') || ''
            const processingTime = response.headers.get('X-Processing-Time') || ''

            if (response.ok) {
              if (enhanced === 'ai') {
                // ZAI actually generated an AI-enhanced tile!
                enhancementTracker.current.succeeded++
                setAiTileCount(enhancementTracker.current.succeeded)
                setEnhancementStatus('enhanced')
                console.log(`[MapComponent v7.3] AI tile DONE: ${tileKey} (${processingTime}ms)`)
              } else if (enhanced === 'original') {
                // ZAI returned original as fallback (SDK might not be working)
                console.warn(`[MapComponent v7.3] AI returned original tile for ${tileKey} (X-Enhanced: ${enhanced})`)
                enhancementTracker.current.failed++

                if (enhancementTracker.current.failed >= 3 && enhancementTracker.current.succeeded === 0) {
                  setZaiError('ZAI returning original tiles — SDK may not be configured')
                  setEnhancementStatus('unavailable')
                }
              } else {
                // Cached AI tile
                if (enhanced === 'ai') {
                  enhancementTracker.current.succeeded++
                  setAiTileCount(enhancementTracker.current.succeeded)
                }
                console.log(`[MapComponent v7.3] Tile ${tileKey}: X-Enhanced=${enhanced}, X-Cache=${response.headers.get('X-Cache')}`)
              }
            } else {
              // API error
              enhancementTracker.current.failed++
              const errorData = await response.json().catch(() => ({}))
              console.warn(`[MapComponent v7.3] AI generation failed for ${tileKey}:`, response.status, errorData)

              if (errorData.fallback || response.status === 503) {
                setZaiError('ZAI SDK not available on server')
                setEnhancementStatus('unavailable')
              }
            }
          })
          .catch((err) => {
            enhancementTracker.current.failed++
            console.warn(`[MapComponent v7.3] AI request failed for ${tileKey}:`, err)
          })
      })

      // Track zoom for status
      map.on('zoomend', () => {
        const zoom = map.getZoom()
        if (zoom >= AI_ENHANCE_MIN_ZOOM && enhancementStatus === 'off') {
          setEnhancementStatus('proxy')
        }
      })

      mapRef.current = map
      setIsMapReady(true)

      console.log('[MapComponent v8.1] Map initialized. ZAI status:', zaiStatus)
    })

    return () => {
      mountIdRef.current++
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      setIsMapReady(false)
      setEnhancementStatus('off')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ============================================
  // SYNC VIEW MODE → MAP ZOOM
  // ============================================

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return

    if (viewMode === '3d') {
      mapRef.current.flyTo(
        [WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng],
        BUILDING_ZOOM,
        { duration: ZOOM_DURATION, easeLinearity: 0.25 }
      )
    } else {
      mapRef.current.flyTo(
        [WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng],
        OVERVIEW_ZOOM,
        { duration: ZOOM_DURATION, easeLinearity: 0.25 }
      )
    }
  }, [viewMode, isMapReady])

  // ============================================
  // UPDATE MARKERS
  // ============================================

  useEffect(() => {
    if (!mapRef.current || !isMapReady) return

    import('leaflet').then((L) => {
      const map = mapRef.current!
      const LMarker = L.Marker
      const LCircleMarker = L.CircleMarker

      map.eachLayer((layer) => {
        if (layer instanceof LMarker || layer instanceof LCircleMarker || layer instanceof L.Polyline) {
          map.removeLayer(layer)
        }
      })

      const warehouseIcon = L.divIcon({
        html: `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#34a853,#0d9c38);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(52,168,83,0.4);border:3px solid white;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`,
        className: '', iconSize: [40, 40], iconAnchor: [20, 20]
      })
      L.marker([WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng], { icon: warehouseIcon })
        .addTo(map).bindPopup(`<b>${WAREHOUSE_LOCATION.name}</b>`)

      if (displayMode === 'deliveries' && deliveries.length > 0) {
        deliveries.forEach(delivery => {
          const priorityColors: Record<string, string> = { urgent: '#ef4444', today: '#f59e0b', later: '#6b7280' }
          const color = priorityColors[delivery.priority] || '#6b7280'
          const icon = L.divIcon({
            html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px ${color}66;border:2px solid white;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg></div>`,
            className: '', iconSize: [28, 28], iconAnchor: [14, 14]
          })
          L.marker([delivery.lat, delivery.lng], { icon })
            .addTo(map).bindPopup(`<b>${delivery.shopName}</b><br/>${delivery.location}<br/><small>${delivery.products}</small>`)
        })
      }

      if (displayMode === 'regions' && regions.length > 0) {
        regions.forEach(region => {
          const icon = L.divIcon({
            html: `<div style="min-width:60px;padding:4px 8px;border-radius:8px;background:white;box-shadow:0 2px 8px rgba(0,0,0,0.15);text-align:center;font-size:11px;font-weight:600;"><div>${region.name}</div><div style="color:#2563eb;">${region.totalDeliveries} deliveries</div></div>`,
            className: '', iconSize: [80, 40], iconAnchor: [40, 20]
          })
          L.marker([region.lat, region.lng], { icon })
            .addTo(map).bindPopup(`<b>${region.name}</b><br/>Total: ${region.totalDeliveries} deliveries<br/>Value: ${region.totalValue}`)
        })
      }

      if (displayMode === 'route' && optimizedStops.length > 0) {
        const routeCoords: L.LatLngExpression[] = [[WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng]]
        optimizedStops.forEach((stop) => {
          routeCoords.push([stop.delivery.lat, stop.delivery.lng])
          const icon = L.divIcon({
            html: `<div style="width:32px;height:32px;border-radius:50%;background:#4285f4;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(66,133,244,0.4);border:3px solid white;"><span style="color:white;font-size:13px;font-weight:700;">${stop.order}</span></div>`,
            className: '', iconSize: [32, 32], iconAnchor: [16, 16]
          })
          L.marker([stop.delivery.lat, stop.delivery.lng], { icon })
            .addTo(map).bindPopup(`<b>Stop ${stop.order}: ${stop.delivery.shopName}</b><br/>${stop.distance} away<br/>~${stop.time}`)
        })
        if (routeCoords.length >= 2) {
          L.polyline(routeCoords, { color: '#4285f4', weight: 4, opacity: 0.8, dashArray: '8, 8' }).addTo(map)
          const bounds = L.latLngBounds(routeCoords)
          map.fitBounds(bounds, { padding: [50, 50] })
        }
      }
    })
  }, [deliveries, regions, optimizedStops, displayMode, isMapReady])

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* CSS Filter Enhancement */}
      <style>{`
        .ai-enhanced-tiles .leaflet-tile {
          filter: brightness(1.08) contrast(1.12) saturate(1.25);
          transition: filter 0.8s ease;
        }
      `}</style>

      {/* Zoom Button */}
      <button
        onClick={handleZoomToBuildings}
        aria-label={viewMode === '2d' ? 'Zoom to building-level detail' : 'Zoom back to city overview'}
        title={viewMode === '2d' ? 'Zoom to Buildings' : 'Back to Overview'}
        className="absolute top-4 right-4 z-[1000] px-4 py-2 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-all text-sm font-medium text-gray-700 flex items-center gap-2"
      >
        {viewMode === '2d' ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            3D View
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            Back to Overview
          </>
        )}
      </button>

      {/* AI Enhancement Status Indicator */}
      <div className="absolute bottom-4 right-4 z-[1000] flex flex-col items-end gap-1">
        {/* Main status pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-lg text-xs font-medium">
          <span className={`inline-block w-2 h-2 rounded-full ${
            enhancementStatus === 'enhanced' ? 'bg-green-500' :
            enhancementStatus === 'enhancing' ? 'bg-blue-500 animate-pulse' :
            enhancementStatus === 'checking' ? 'bg-yellow-500 animate-pulse' :
            enhancementStatus === 'unavailable' ? 'bg-red-500' :
            enhancementStatus === 'proxy' ? 'bg-yellow-500' :
            'bg-gray-400'
          }`} />

          <span className="text-gray-600">
            {enhancementStatus === 'off' && 'Satellite'}
            {enhancementStatus === 'checking' && 'Checking ZAI...'}
            {enhancementStatus === 'proxy' && 'ZAI Processing...'}
            {enhancementStatus === 'enhancing' && `ZAI Enhancing (${aiTileCount} done)`}
            {enhancementStatus === 'enhanced' && `ZAI Enhanced (${aiTileCount} tiles)`}
            {enhancementStatus === 'unavailable' && 'ZAI Unavailable'}
          </span>
        </div>

        {/* Error detail (if ZAI unavailable) */}
        {zaiError && (
          <div className="px-3 py-1 bg-red-50 border border-red-200 rounded-lg shadow text-xs text-red-600 max-w-64">
            {zaiError}
          </div>
        )}
      </div>
    </div>
  )
}
