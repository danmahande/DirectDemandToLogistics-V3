'use client'

/**
 * pageFixed.tsx
 *
 * Main dashboard page for DirectDDL Logistics Platform.
 * Clean implementation with:
 * - 2D Leaflet map (CARTO tiles, free, reliable)
 * - 3D MapLibre navigation (ESRI satellite + OpenFreeMap buildings)
 * - Route optimization (nearest neighbor + priority)
 * - Region performance analytics
 * - Alert system
 *
 * FIXED: No AI enhancement code. No fallback patterns. Only reliable free APIs.
 */

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  Truck, Search, Sun, Package, MapPin, Phone,
  AlertTriangle, DollarSign,
  ChevronRight, Navigation, Bell, Check,
  TrendingUp, TrendingDown, BarChart3, Map,
  Route, Play, RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Dynamic imports for map components (SSR disabled for browser APIs)
const MapComponent = dynamic(() => import('@/components/map/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
      <div className="text-gray-500">Loading map...</div>
    </div>
  )
})

const Navigation3DComponent = dynamic(() => import('@/components/map/Navigation3DComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4" />
      <div className="text-gray-600 font-medium">Loading 3D map...</div>
      <div className="text-gray-400 text-sm mt-2">ESRI Satellite + OpenFreeMap 3D Buildings</div>
    </div>
  )
})

// ============================================
// TYPES
// ============================================

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

interface Alert {
  id: number
  type: 'stock' | 'payment' | 'order'
  title: string
  message: string
  time: string
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

// ============================================
// SAMPLE DATA (Kampala, Uganda)
// ============================================

const deliveries: Delivery[] = [
  { id: 1, shopName: 'Kololo Supermarket', location: 'Kololo', products: 'Rice 50kg, Sugar 30kg', amount: 'UGX 450,000', status: 'pending', priority: 'urgent', phone: '+256 700 123 456', lat: 0.3333, lng: 32.5824, paid: false, region: 'Kololo' },
  { id: 2, shopName: 'Nakasero Market Store', location: 'Nakasero', products: 'Cooking Oil 20L', amount: 'UGX 280,000', status: 'pending', priority: 'today', phone: '+256 701 234 567', lat: 0.3118, lng: 32.5795, paid: true, region: 'Nakasero' },
  { id: 3, shopName: 'Mega Store', location: 'Kampala Central', products: 'Soap 100 units', amount: 'UGX 350,000', status: 'in-progress', priority: 'today', phone: '+256 702 345 678', lat: 0.3177, lng: 32.5812, paid: true, region: 'Central' },
  { id: 4, shopName: 'Wandegeya Traders', location: 'Wandegeya', products: 'Flour 10 bags', amount: 'UGX 520,000', status: 'pending', priority: 'urgent', phone: '+256 703 456 789', lat: 0.3311, lng: 32.5736, paid: false, region: 'Wandegeya' },
  { id: 5, shopName: 'Kisaasi Shop', location: 'Kisaasi', products: 'Rice 25kg, Salt 5kg', amount: 'UGX 180,000', status: 'pending', priority: 'later', phone: '+256 704 567 890', lat: 0.3694, lng: 32.5900, paid: true, region: 'Kisaasi' },
  { id: 6, shopName: 'Bugolobi Store', location: 'Bugolobi', products: 'Cooking Oil 20L, Rice 50kg', amount: 'UGX 620,000', status: 'completed', priority: 'today', phone: '+256 705 678 901', lat: 0.3100, lng: 32.6250, paid: true, region: 'Bugolobi' },
  { id: 7, shopName: 'Ntinda Market', location: 'Ntinda', products: 'Rice 100kg, Sugar 50kg', amount: 'UGX 890,000', status: 'completed', priority: 'urgent', phone: '+256 706 789 012', lat: 0.3550, lng: 32.6144, paid: true, region: 'Ntinda' },
]

const alerts: Alert[] = [
  { id: 1, type: 'stock', title: 'Low Stock', message: 'Rice (5kg) - Only 12 units left', time: '10 min ago' },
  { id: 2, type: 'payment', title: 'Payment Due', message: 'Kololo Supermarket owes UGX 450,000', time: '2 hours ago' },
  { id: 3, type: 'order', title: 'New Order', message: 'Bugolobi Store wants 20L Cooking Oil', time: '3 hours ago' },
]

const regionStats: RegionStats[] = [
  { name: 'Ntinda', totalDeliveries: 45, totalValue: 'UGX 8.2M', topProducts: [{ name: 'Rice', count: 28, trend: 'up' }, { name: 'Sugar', count: 22, trend: 'up' }, { name: 'Cooking Oil', count: 18, trend: 'same' }], growth: 24, lat: 0.3420, lng: 32.5750 },
  { name: 'Kololo', totalDeliveries: 38, totalValue: 'UGX 7.5M', topProducts: [{ name: 'Rice', count: 25, trend: 'up' }, { name: 'Cooking Oil', count: 20, trend: 'up' }, { name: 'Sugar', count: 15, trend: 'same' }], growth: 18, lat: 0.3333, lng: 32.5824 },
  { name: 'Wandegeya', totalDeliveries: 32, totalValue: 'UGX 5.8M', topProducts: [{ name: 'Flour', count: 22, trend: 'up' }, { name: 'Rice', count: 18, trend: 'same' }, { name: 'Soap', count: 14, trend: 'down' }], growth: 12, lat: 0.3476, lng: 32.5725 },
  { name: 'Bugolobi', totalDeliveries: 28, totalValue: 'UGX 4.9M', topProducts: [{ name: 'Cooking Oil', count: 20, trend: 'up' }, { name: 'Rice', count: 16, trend: 'same' }, { name: 'Sugar', count: 12, trend: 'up' }], growth: 15, lat: 0.3100, lng: 32.6100 },
  { name: 'Nakasero', totalDeliveries: 25, totalValue: 'UGX 4.2M', topProducts: [{ name: 'Cooking Oil', count: 18, trend: 'same' }, { name: 'Rice', count: 14, trend: 'down' }, { name: 'Soap', count: 10, trend: 'same' }], growth: -5, lat: 0.3152, lng: 32.5814 },
  { name: 'Kamwokya', totalDeliveries: 22, totalValue: 'UGX 3.6M', topProducts: [{ name: 'Flour', count: 15, trend: 'up' }, { name: 'Soap', count: 12, trend: 'same' }, { name: 'Rice', count: 10, trend: 'up' }], growth: 8, lat: 0.3300, lng: 32.5700 },
]

const productPerformance = [
  { name: 'Rice', totalSold: 156, bestRegion: 'Ntinda', growth: 22, color: 'bg-blue-500' },
  { name: 'Cooking Oil', totalSold: 124, bestRegion: 'Bugolobi', growth: 18, color: 'bg-yellow-500' },
  { name: 'Sugar', totalSold: 98, bestRegion: 'Kololo', growth: 15, color: 'bg-green-500' },
  { name: 'Flour', totalSold: 87, bestRegion: 'Wandegeya', growth: 12, color: 'bg-orange-500' },
  { name: 'Soap', totalSold: 72, bestRegion: 'Kamwokya', growth: 5, color: 'bg-purple-500' },
]

// ============================================
// UTILITY FUNCTIONS
// ============================================

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

const optimizeRoute = (deliveries: Delivery[], startLat: number, startLng: number): RouteStop[] => {
  const pending = deliveries.filter(d => d.status !== 'completed')
  const visited = new Set<number>()
  const route: RouteStop[] = []
  let currentLat = startLat
  let currentLng = startLng

  const getPriorityBoost = (d: Delivery): number => {
    return d.priority === 'urgent' ? -2 : d.priority === 'today' ? -1 : 0
  }

  while (visited.size < pending.length) {
    let nearest: Delivery | null = null
    let nearestDist = Infinity

    for (const delivery of pending) {
      if (visited.has(delivery.id)) continue
      const dist = calculateDistance(currentLat, currentLng, delivery.lat, delivery.lng) + getPriorityBoost(delivery)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = delivery
      }
    }

    if (nearest) {
      visited.add(nearest.id)
      const actualDist = calculateDistance(currentLat, currentLng, nearest.lat, nearest.lng)
      route.push({
        order: route.length + 1,
        delivery: nearest,
        distance: `${actualDist.toFixed(1)} km`,
        time: `${Math.round(actualDist * 3 + 5)} min`
      })
      currentLat = nearest.lat
      currentLng = nearest.lng
    }
  }

  return route
}

const todaysStats = {
  deliveries: 5,
  completed: 1,
  pending: 4,
  totalValue: 'UGX 1.78M',
  collected: 'UGX 810K',
  uncollected: 'UGX 970K',
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function SupplierDashboardFixed() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'deliveries' | 'alerts' | 'regions'>('deliveries')
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<RegionStats | null>(null)
  const [greeting, setGreeting] = useState('Good morning')

  // Route optimization state
  const [optimizedRoute, setOptimizedRoute] = useState<RouteStop[]>([])
  const [showOptimizedRoute, setShowOptimizedRoute] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)

  // Warehouse location (Nakasero Market area)
  const warehouseLat = 0.3118
  const warehouseLng = 32.5795

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 12 && hour < 17) setGreeting('Good afternoon')
    else if (hour >= 17) setGreeting('Good evening')
  }, [])

  const urgentCount = deliveries.filter(d => d.priority === 'urgent').length
  const pendingDeliveries = deliveries.filter(d => d.status !== 'completed')

  const totalRouteDistance = optimizedRoute.reduce((sum, stop) => sum + parseFloat(stop.distance), 0)
  const totalRouteTime = optimizedRoute.reduce((sum, stop) => sum + parseInt(stop.time), 0)

  const handleOptimizeRoute = () => {
    setIsOptimizing(true)
    setTimeout(() => {
      const route = optimizeRoute(deliveries, warehouseLat, warehouseLng)
      setOptimizedRoute(route)
      setShowOptimizedRoute(true)
      setIsOptimizing(false)
    }, 500)
  }

  const clearRoute = () => {
    setOptimizedRoute([])
    setShowOptimizedRoute(false)
    setIsNavigating(false)
  }

  const startNavigation = () => {
    if (optimizedRoute.length > 0) {
      setIsNavigating(true)
    }
  }

  const exitNavigation = () => {
    setIsNavigating(false)
  }

  const completeNavigation = () => {
    setIsNavigating(false)
    setShowOptimizedRoute(false)
    setOptimizedRoute([])
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className={cn(
        'w-[380px] h-screen bg-white border-r border-gray-200 flex flex-col relative z-50 transition-transform duration-300',
        sidebarCollapsed && '-translate-x-[380px]'
      )}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-gray-900">DirectDDL</div>
                <div className="text-xs text-gray-500">Supplier Dashboard</div>
              </div>
            </div>
            <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Notifications" title="View notifications">
              <Bell className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search shops, products, regions..."
              className="w-full h-10 pl-10 pr-4 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="p-4 pb-2">
          <div className="flex gap-1">
            <button
              onClick={() => { setActiveTab('deliveries'); clearRoute(); }}
              className={cn(
                'flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1',
                activeTab === 'deliveries' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              <Truck className="w-3.5 h-3.5" />
              Deliveries
            </button>
            <button
              onClick={() => { setActiveTab('regions'); clearRoute(); }}
              className={cn(
                'flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1',
                activeTab === 'regions' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              <Map className="w-3.5 h-3.5" />
              Regions
            </button>
            <button
              onClick={() => { setActiveTab('alerts'); clearRoute(); }}
              className={cn(
                'flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1',
                activeTab === 'alerts' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              <Bell className="w-3.5 h-3.5" />
              Alerts
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">

          {/* DELIVERIES TAB */}
          {activeTab === 'deliveries' && (
            <>
              <div className="mb-4">
                <div className="p-4 bg-blue-600 rounded-xl text-white">
                  <div className="flex items-center gap-2 text-sm opacity-90 mb-1">
                    <Sun className="w-4 h-4" />
                    {greeting}, Uganda Distributors
                  </div>
                  <div className="text-2xl font-bold mb-3">{pendingDeliveries.length} deliveries pending</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <div className="text-lg font-bold">{todaysStats.completed}</div>
                      <div className="text-xs opacity-80">Done</div>
                    </div>
                    <div className="p-2 bg-white/20 rounded-lg">
                      <div className="text-lg font-bold">{pendingDeliveries.length}</div>
                      <div className="text-xs opacity-80">Pending</div>
                    </div>
                    <div className="p-2 bg-white/20 rounded-lg">
                      <div className="text-lg font-bold">{urgentCount}</div>
                      <div className="text-xs opacity-80">Urgent</div>
                    </div>
                  </div>
                </div>
              </div>

              {!showOptimizedRoute ? (
                <button
                  onClick={handleOptimizeRoute}
                  disabled={isOptimizing}
                  className="w-full mb-4 p-3 bg-green-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50"
                >
                  {isOptimizing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Optimizing Route...
                    </>
                  ) : (
                    <>
                      <Route className="w-4 h-4" />
                      Optimize My Route
                    </>
                  )}
                </button>
              ) : (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                      <Route className="w-4 h-4" />
                      Optimized Route
                    </div>
                    <button onClick={clearRoute} className="text-xs text-gray-500 hover:text-gray-700">
                      Clear
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="text-center p-2 bg-white rounded-lg">
                      <div className="text-lg font-bold text-gray-900">{totalRouteDistance.toFixed(1)} km</div>
                      <div className="text-xs text-gray-500">Total Distance</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded-lg">
                      <div className="text-lg font-bold text-gray-900">{totalRouteTime} min</div>
                      <div className="text-xs text-gray-500">Est. Time</div>
                    </div>
                  </div>
                  <button
                    onClick={startNavigation}
                    className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Start 3D Navigation
                  </button>
                </div>
              )}

              {/* Route Stops */}
              {showOptimizedRoute && optimizedRoute.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-semibold text-gray-700 mb-2">Route Order</div>
                  <div className="space-y-2">
                    {optimizedRoute.map((stop, index) => (
                      <div
                        key={stop.delivery.id}
                        onClick={() => setSelectedDelivery(stop.delivery)}
                        className={cn(
                          'p-3 bg-white border rounded-xl cursor-pointer transition-all',
                          selectedDelivery?.id === stop.delivery.id ? 'border-green-500 ring-2 ring-green-100' : 'border-gray-200',
                          stop.delivery.priority === 'urgent' && 'border-l-4 border-l-red-500'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm',
                            index === 0 ? 'bg-green-500' : index === optimizedRoute.length - 1 ? 'bg-red-500' : 'bg-blue-500'
                          )}>
                            {stop.order}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 text-sm truncate">{stop.delivery.shopName}</div>
                            <div className="text-xs text-gray-500">{stop.delivery.location}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-medium text-gray-900">{stop.distance}</div>
                            <div className="text-xs text-gray-400">{stop.time}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regular Deliveries List */}
              {!showOptimizedRoute && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-gray-700 mb-2">All Pending Deliveries</div>
                  {pendingDeliveries.map((delivery) => (
                    <div
                      key={delivery.id}
                      onClick={() => setSelectedDelivery(delivery)}
                      className={cn(
                        'p-3 bg-white border rounded-xl cursor-pointer transition-all hover:shadow-md',
                        selectedDelivery?.id === delivery.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200',
                        delivery.priority === 'urgent' && 'border-l-4 border-l-red-500'
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{delivery.shopName}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {delivery.location}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-900 text-sm">{delivery.amount}</div>
                          {delivery.paid ? (
                            <span className="text-xs text-green-600 font-medium">Paid</span>
                          ) : (
                            <span className="text-xs text-orange-600 font-medium">COD</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500">{delivery.products}</div>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          delivery.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                          delivery.priority === 'today' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        )}>
                          {delivery.priority === 'urgent' ? 'URGENT' : delivery.priority === 'today' ? 'Today' : 'Later'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* REGIONS TAB */}
          {activeTab === 'regions' && (
            <>
              <div className="mb-4 p-4 bg-green-600 rounded-xl text-white">
                <div className="flex items-center gap-2 text-sm opacity-90 mb-1">
                  <BarChart3 className="w-4 h-4" />
                  This Month&apos;s Performance
                </div>
                <div className="text-2xl font-bold mb-2">{regionStats.length} Regions Active</div>
                <div className="text-sm opacity-80">Best: Ntinda (+24% growth)</div>
              </div>

              <div className="mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Top Products This Month</div>
                <div className="space-y-2">
                  {productPerformance.map((product, i) => (
                    <div key={i} className="p-3 bg-white border border-gray-200 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn('w-3 h-3 rounded-full', product.color)} />
                          <span className="font-semibold text-sm">{product.name}</span>
                        </div>
                        <span className={cn(
                          'text-xs font-medium flex items-center gap-1',
                          product.growth > 10 ? 'text-green-600' : product.growth > 0 ? 'text-blue-600' : 'text-red-600'
                        )}>
                          {product.growth > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {product.growth}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{product.totalSold} units sold</span>
                        <span>Best: {product.bestRegion}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-2">
                <div className="text-sm font-semibold text-gray-700 mb-2">Regions by Performance</div>
                <div className="space-y-2">
                  {regionStats.map((region, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedRegion(selectedRegion?.name === region.name ? null : region)}
                      className={cn(
                        'p-3 bg-white border rounded-xl cursor-pointer transition-all',
                        selectedRegion?.name === region.name ? 'border-green-500 ring-2 ring-green-100' : 'border-gray-200'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </span>
                          <span className="font-semibold text-sm">{region.name}</span>
                        </div>
                        <span className={cn(
                          'text-xs font-medium flex items-center gap-1',
                          region.growth > 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                          {region.growth > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {region.growth > 0 ? '+' : ''}{region.growth}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <span>{region.totalDeliveries} deliveries</span>
                        <span className="font-medium text-gray-900">{region.totalValue}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {region.topProducts.slice(0, 3).map((p, j) => (
                          <span key={j} className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            p.trend === 'up' ? 'bg-green-100 text-green-700' :
                            p.trend === 'down' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          )}>
                            {p.name} ({p.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ALERTS TAB */}
          {activeTab === 'alerts' && (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="p-3 bg-white border border-gray-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      alert.type === 'stock' ? 'bg-yellow-100 text-yellow-600' :
                      alert.type === 'payment' ? 'bg-red-100 text-red-600' :
                      'bg-blue-100 text-blue-600'
                    )}>
                      {alert.type === 'stock' ? <AlertTriangle className="w-4 h-4" /> :
                       alert.type === 'payment' ? <DollarSign className="w-4 h-4" /> :
                       <Package className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 text-sm">{alert.title}</div>
                      <div className="text-xs text-gray-500">{alert.message}</div>
                      <div className="text-xs text-gray-400 mt-1">{alert.time}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Delivery Action Bar */}
        {activeTab === 'deliveries' && selectedDelivery && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-500 mb-2">Selected: {selectedDelivery.shopName}</div>
            <div className="grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                <Navigation className="w-4 h-4" />
                Navigate
              </button>
              <button className="flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                <Phone className="w-4 h-4" />
                Call
              </button>
            </div>
            <button className="w-full mt-2 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center justify-center gap-2">
              <Check className="w-4 h-4" />
              Mark as Delivered
            </button>
          </div>
        )}
      </aside>

      {/* Main Content - Map */}
      <main className="flex-1 relative">
        {isNavigating && optimizedRoute.length > 0 ? (
          <Navigation3DComponent
            stops={optimizedRoute}
            warehouseLat={warehouseLat}
            warehouseLng={warehouseLng}
            onStart={() => console.log('Navigation started')}
            onComplete={completeNavigation}
            onExit={exitNavigation}
          />
        ) : (
          <>
            <MapComponent
              deliveries={deliveries}
              regions={activeTab === 'regions' ? regionStats : undefined}
              selectedDelivery={selectedDelivery}
              selectedRegion={selectedRegion}
              showRegions={activeTab === 'regions'}
              optimizedRoute={showOptimizedRoute ? optimizedRoute : undefined}
            />

            {/* Map Overlay */}
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* Top Bar */}
              <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto">
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="w-10 h-10 bg-white rounded-lg shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50"
                  aria-label="Toggle menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>

                <div className="bg-white rounded-lg shadow-md p-3">
                  <div className="text-xs text-gray-500">Today&apos;s Total</div>
                  <div className="text-lg font-bold text-gray-900">{todaysStats.totalValue}</div>
                </div>
              </div>

              {/* Route Summary Bar */}
              {activeTab === 'deliveries' && showOptimizedRoute && optimizedRoute.length > 0 && (
                <div className="absolute top-20 left-4 right-4 pointer-events-auto">
                  <div className="bg-white rounded-lg shadow-md p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-gray-500">Optimized Route</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {optimizedRoute.length} stops - {totalRouteDistance.toFixed(1)} km - {totalRouteTime} min
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {optimizedRoute.slice(0, 4).map((stop, i) => (
                          <div key={i} className="flex items-center">
                            <span className={cn(
                              'w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold',
                              i === 0 ? 'bg-green-500' : i === optimizedRoute.length - 1 ? 'bg-red-500' : 'bg-blue-500'
                            )}>
                              {stop.order}
                            </span>
                            {i < 3 && i < optimizedRoute.length - 1 && (
                              <ChevronRight className="w-3 h-3 text-gray-300 mx-0.5" />
                            )}
                          </div>
                        ))}
                        {optimizedRoute.length > 4 && (
                          <span className="text-xs text-gray-400 ml-1">+{optimizedRoute.length - 4}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Stats */}
              {activeTab === 'deliveries' && !showOptimizedRoute && (
                <div className="absolute bottom-4 left-4 right-4 flex justify-between pointer-events-auto">
                  <div className="bg-white rounded-lg shadow-md p-3 flex-1 mr-2">
                    <div className="text-xs text-gray-500 mb-1">Suggested Route</div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                      <span className="text-sm font-medium">Kololo</span>
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                      <span className="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                      <span className="text-sm font-medium">Wandegeya</span>
                      <span className="text-xs text-gray-400 ml-2">+3 more</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-md p-3">
                    <div className="text-xs text-gray-500 mb-1">Priority</div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Urgent</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Today</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> Later</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Regions Bottom Stats */}
              {activeTab === 'regions' && (
                <div className="absolute bottom-4 left-4 right-4 pointer-events-auto">
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <div className="text-sm font-semibold text-gray-700 mb-2">Regional Performance</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {regionStats.slice(0, 4).map((r, i) => (
                        <div key={i} onClick={() => setSelectedRegion(selectedRegion?.name === r.name ? null : r)}
                          className={cn(
                            'p-2 rounded-lg cursor-pointer transition-all',
                            selectedRegion?.name === r.name ? 'bg-green-100 border border-green-300' : 'bg-gray-50 hover:bg-gray-100'
                          )}
                        >
                          <div className="text-xs font-semibold text-gray-900">{r.name}</div>
                          <div className={cn('text-xs font-medium', r.growth > 0 ? 'text-green-600' : 'text-red-600')}>
                            {r.growth > 0 ? '+' : ''}{r.growth}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
