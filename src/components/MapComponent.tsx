'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import dynamic from 'next/dynamic'

// Dynamically import 3D map to avoid SSR issues
const Map3DComponent = dynamic(() => import('./Map3DComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-2xl">
      <div className="text-gray-500">Loading 3D map...</div>
    </div>
  )
})

interface Delivery {
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

interface RegionStats {
  name: string
  totalDeliveries: number
  totalValue: string
  topProducts: { name: string; count: number; trend: 'up' | 'down' | 'same' }[]
  growth: number
  lat: number
  lng: number
}

interface RouteStop {
  order: number
  delivery: Delivery
  distance: string
  time: string
}

interface MapComponentProps {
  deliveries: Delivery[]
  regions?: RegionStats[]
  selectedDelivery: Delivery | null
  selectedRegion: RegionStats | null
  showRegions?: boolean
  optimizedRoute?: RouteStop[]
  is3DMode?: boolean
  onExit3D?: () => void
}

// ═══════════════════════════════════════════════════════════
// MARKER ICONS - Clean, minimal Japanese style
// ═══════════════════════════════════════════════════════════

// Route stop marker with smooth design
const getRouteStopIcon = (order: number, isFirst: boolean, isLast: boolean) => {
  const bgColor = isFirst ? '#10b981' : isLast ? '#3b82f6' : '#2563eb'
  const size = 40
  
  return L.divIcon({
    className: 'custom-marker route-stop',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${bgColor};
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 16px ${bgColor}50, 0 2px 4px rgba(0,0,0,0.1);
        border: 3px solid white;
        transition: transform 0.2s ease;
      ">
        <span style="color: white; font-size: 15px; font-weight: 600; font-family: 'Inter', sans-serif;">${order}</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 8],
  })
}

// Delivery marker - clean pin design
const getMarkerIcon = (priority: Delivery['priority'], isSelected: boolean, isCurrent: boolean) => {
  const colors = {
    urgent: '#ef4444',
    today: '#3b82f6',
    later: '#94a3b8',
  }
  
  const color = colors[priority]
  const size = isSelected ? 44 : 36
  
  return L.divIcon({
    className: 'custom-marker delivery-marker',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        position: relative;
        ${isCurrent ? 'animation: pulse 2s infinite;' : ''}
      ">
        <div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50% 50% 50% 4px;
          background: ${color};
          transform: rotate(-45deg);
          box-shadow: 0 4px 12px ${color}40, 0 2px 4px rgba(0,0,0,0.15);
          ${isSelected ? 'border: 3px solid #1e293b;' : 'border: 2px solid white;'}
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            width: ${size * 0.35}px;
            height: ${size * 0.35}px;
            background: white;
            border-radius: 50%;
            transform: rotate(45deg);
          "></div>
        </div>
        ${isCurrent ? `
          <div style="
            position: absolute;
            top: -4px;
            left: -4px;
            right: -4px;
            bottom: -4px;
            border-radius: 50%;
            border: 2px solid ${color};
            opacity: 0.5;
            animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
          "></div>
        ` : ''}
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes ping {
          75%, 100% { transform: scale(1.5); opacity: 0; }
        }
      </style>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size - 8],
  })
}

// Region marker - compact badge style
const getRegionIcon = (region: RegionStats, isSelected: boolean) => {
  const size = isSelected ? 64 : 56
  const bgColor = region.growth > 15 ? '#10b981' : region.growth > 0 ? '#2563eb' : '#ef4444'
  
  return L.divIcon({
    className: 'custom-marker region-marker',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 16px;
        background: ${bgColor};
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-shadow: 0 6px 20px ${bgColor}40, 0 2px 6px rgba(0,0,0,0.1);
        border: 3px solid white;
        ${isSelected ? 'outline: 3px solid #1e293b; outline-offset: 2px;' : ''}
        transition: transform 0.2s ease;
        cursor: pointer;
      ">
        <div style="color: white; font-size: ${size * 0.22}px; font-weight: 600; font-family: 'Inter', sans-serif; letter-spacing: -0.02em;">${region.name.substring(0, 4)}</div>
        <div style="color: rgba(255,255,255,0.9); font-size: ${size * 0.18}px; font-weight: 500; font-family: 'Inter', sans-serif;">${region.growth > 0 ? '+' : ''}${region.growth}%</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 8],
  })
}

// Warehouse icon - clean
const warehouseIcon = L.divIcon({
  className: 'custom-marker warehouse-marker',
  html: `
    <div style="
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 20px rgba(30, 41, 59, 0.3), 0 2px 6px rgba(0,0,0,0.1);
      border: 3px solid white;
    ">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    </div>
  `,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -32],
})

// Start icon - prominent green
const startIcon = L.divIcon({
  className: 'custom-marker start-marker',
  html: `
    <div style="
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 24px rgba(16, 185, 129, 0.4), 0 2px 6px rgba(0,0,0,0.1);
      border: 4px solid white;
    ">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" strokelinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polygon points="10 8 16 12 10 16 10 8"/>
      </svg>
    </div>
  `,
  iconSize: [56, 56],
  iconAnchor: [28, 28],
  popupAnchor: [0, -36],
})

export default function MapComponent({ 
  deliveries = [], 
  regions = [],
  selectedDelivery, 
  selectedRegion,
  showRegions = false,
  optimizedRoute,
  is3DMode = false,
  onExit3D
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const routeLineRef = useRef<L.Polyline | null>(null)
  const warehouseMarkerRef = useRef<L.Marker | null>(null)

  const warehouseLat = 0.3152
  const warehouseLng = 32.5814

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: [0.3250, 32.5800],
      zoom: 13,
      zoomControl: false,
    })

    // Clean tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    warehouseMarkerRef.current = L.marker([warehouseLat, warehouseLng], { icon: warehouseIcon })
      .addTo(map)
      .bindPopup(`
        <div style="padding: 12px; font-family: 'Inter', sans-serif;">
          <div style="font-weight: 600; font-size: 14px; color: #0f172a;">Your Warehouse</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Uganda Distributors</div>
        </div>
      `)

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Update markers
  useEffect(() => {
    if (!mapInstanceRef.current) return

    const map = mapInstanceRef.current

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []
    if (routeLineRef.current) {
      routeLineRef.current.remove()
      routeLineRef.current = null
    }

    // Optimized Route Mode
    if (optimizedRoute && optimizedRoute.length > 0) {
      const routeCoords: [number, number][] = [[warehouseLat, warehouseLng]]
      
      // Start marker
      const startMarker = L.marker([warehouseLat, warehouseLng], { icon: startIcon })
        .addTo(map)
        .bindPopup(`
          <div style="padding: 12px; font-family: 'Inter', sans-serif;">
            <div style="font-weight: 600; font-size: 14px; color: #10b981;">Start Here</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Your warehouse location</div>
          </div>
        `)
      markersRef.current.push(startMarker)

      // Route stops
      optimizedRoute.forEach((stop, index) => {
        const isFirst = index === 0
        const isLast = index === optimizedRoute.length - 1
        routeCoords.push([stop.delivery.lat, stop.delivery.lng])

        const marker = L.marker([stop.delivery.lat, stop.delivery.lng], { 
          icon: getRouteStopIcon(stop.order, isFirst, isLast) 
        })
          .addTo(map)
          .bindPopup(`
            <div style="padding: 16px; min-width: 220px; font-family: 'Inter', sans-serif;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <span style="width: 28px; height: 28px; border-radius: 50%; background: ${isFirst ? '#10b981' : isLast ? '#3b82f6' : '#2563eb'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px;">${stop.order}</span>
                <span style="font-weight: 600; font-size: 15px; color: #0f172a;">${stop.delivery.shopName}</span>
              </div>
              <div style="font-size: 12px; color: #64748b; margin-bottom: 12px; display: flex; align-items: center; gap: 4px;">
                <span style="width: 16px; height: 16px; border-radius: 4px; background: #f1f5f9; display: flex; align-items: center; justify-content: center;">📍</span>
                ${stop.delivery.location}
              </div>
              <div style="padding: 10px; background: #f8fafc; border-radius: 10px; margin-bottom: 12px;">
                <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Products</div>
                <div style="font-size: 13px; font-weight: 500; color: #1e293b; margin-top: 4px;">${stop.delivery.products}</div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                  <div style="font-size: 10px; color: #94a3b8;">Amount</div>
                  <div style="font-size: 16px; font-weight: 600; color: #2563eb;">${stop.delivery.amount}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 10px; color: #94a3b8;">From Previous</div>
                  <div style="font-size: 13px; font-weight: 500; color: #1e293b;">${stop.distance} • ${stop.time}</div>
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button style="flex: 1; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 10px; font-size: 12px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                  📍 Navigate
                </button>
                <button style="flex: 1; padding: 10px; background: #10b981; color: white; border: none; border-radius: 10px; font-size: 12px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                  📞 Call
                </button>
              </div>
            </div>
          `)
        markersRef.current.push(marker)
      })

      // Draw smooth route line with animation
      if (routeCoords.length > 1) {
        routeLineRef.current = L.polyline(routeCoords, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.8,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: '0',
        }).addTo(map)

        // Animated dashed overlay
        L.polyline(routeCoords, {
          color: '#ffffff',
          weight: 5,
          opacity: 0.4,
          dashArray: '8, 16',
          lineCap: 'round',
        }).addTo(map)

        map.fitBounds(L.latLngBounds(routeCoords), { padding: [100, 100] })
      }

      return
    }

    // Regions Mode
    if (showRegions && regions && regions.length > 0) {
      regions.forEach((region) => {
        const isSelected = selectedRegion?.name === region.name
        const marker = L.marker([region.lat, region.lng], { 
          icon: getRegionIcon(region, isSelected) 
        })
          .addTo(map)
          .bindPopup(`
            <div style="padding: 16px; min-width: 220px; font-family: 'Inter', sans-serif;">
              <div style="font-weight: 600; font-size: 18px; color: #0f172a; margin-bottom: 8px;">${region.name}</div>
              <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                <div style="padding: 10px; background: #f8fafc; border-radius: 10px; text-align: center; flex: 1;">
                  <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase;">Deliveries</div>
                  <div style="font-size: 20px; font-weight: 600; color: #1e293b; margin-top: 4px;">${region.totalDeliveries}</div>
                </div>
                <div style="padding: 10px; background: #f8fafc; border-radius: 10px; text-align: center; flex: 1;">
                  <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase;">Value</div>
                  <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-top: 4px;">${region.totalValue}</div>
                </div>
              </div>
              <div style="font-size: 11px; color: #64748b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Top Products</div>
              ${region.topProducts.map(p => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
                  <span style="font-size: 13px; color: #334155;">${p.name}</span>
                  <span style="font-size: 13px; font-weight: 500; color: ${p.trend === 'up' ? '#10b981' : p.trend === 'down' ? '#ef4444' : '#64748b'};">
                    ${p.count} ${p.trend === 'up' ? '↑' : p.trend === 'down' ? '↓' : ''}
                  </span>
                </div>
              `).join('')}
            </div>
          `)
        markersRef.current.push(marker)
      })

      if (regions.length > 0) {
        const bounds = L.latLngBounds(regions.map(r => [r.lat, r.lng]))
        map.fitBounds(bounds, { padding: [60, 60] })
      }

      if (selectedRegion) {
        map.setView([selectedRegion.lat, selectedRegion.lng], 14, { animate: true })
      }
      return
    }

    // Deliveries Mode (default)
    if (deliveries && deliveries.length > 0) {
      const pending = deliveries.filter(d => d.status !== 'completed')
      const priorityOrder = { urgent: 0, today: 1, later: 2 }
      const sortedDeliveries = [...pending].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

      sortedDeliveries.forEach((delivery) => {
        const isSelected = selectedDelivery?.id === delivery.id
        const isCurrent = delivery.status === 'in-progress'
        const marker = L.marker([delivery.lat, delivery.lng], { 
          icon: getMarkerIcon(delivery.priority, isSelected, isCurrent) 
        })
          .addTo(map)
          .bindPopup(`
            <div style="padding: 16px; min-width: 200px; font-family: 'Inter', sans-serif;">
              <div style="font-weight: 600; font-size: 15px; color: #0f172a; margin-bottom: 4px;">${delivery.shopName}</div>
              <div style="font-size: 12px; color: #64748b; margin-bottom: 12px; display: flex; align-items: center; gap: 4px;">
                <span style="width: 16px; height: 16px; border-radius: 4px; background: #f1f5f9; display: flex; align-items: center; justify-content: center;">📍</span>
                ${delivery.location}
              </div>
              <div style="padding: 10px; background: #f8fafc; border-radius: 10px; margin-bottom: 12px;">
                <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Products</div>
                <div style="font-size: 13px; font-weight: 500; color: #1e293b; margin-top: 4px;">${delivery.products}</div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-size: 18px; font-weight: 600; color: #2563eb;">${delivery.amount}</div>
                ${delivery.paid 
                  ? '<span style="padding: 4px 10px; background: #dcfce7; color: #166534; border-radius: 20px; font-size: 11px; font-weight: 600;">PAID</span>'
                  : '<span style="padding: 4px 10px; background: #fef3c7; color: #92400e; border-radius: 20px; font-size: 11px; font-weight: 600;">COD</span>'
                }
              </div>
              <div style="font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 4px;">
                📞 ${delivery.phone}
              </div>
            </div>
          `)
        markersRef.current.push(marker)
      })

      if (selectedDelivery) {
        map.setView([selectedDelivery.lat, selectedDelivery.lng], 14, { animate: true })
      }
    }

  }, [deliveries, regions, selectedDelivery, selectedRegion, showRegions, optimizedRoute])

  // 3D Mode - render MapLibre GL component after all hooks are called
  if (is3DMode && optimizedRoute && optimizedRoute.length > 0) {
    return (
      <Map3DComponent 
        optimizedRoute={optimizedRoute} 
        onClose={onExit3D || (() => {})} 
      />
    )
  }

  return <div ref={mapRef} className="w-full h-full" />
}
