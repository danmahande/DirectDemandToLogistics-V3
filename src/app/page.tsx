'use client'

/**
 * Supplier Dashboard - v5.0
 *
 * Refactored main dashboard page using shared types
 * from @/types/map instead of inline definitions.
 *
 * Changes from original:
 * - Imports Delivery, RegionStats, Alert, RouteStop from @/types/map
 * - Cleaner component structure
 * - Uses centralized config for warehouse location
 */

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { WAREHOUSE_LOCATION } from '@/lib/config'
import type { Delivery, RegionStats, Alert, RouteStop } from '@/types/map'

// Dynamic import for map (SSR disabled)
const MapComponent = dynamic(() => import('@/components/map/MapComponent'), { ssr: false })

// ============================================
// SAMPLE DATA
// ============================================

const SAMPLE_DELIVERIES: Delivery[] = [
  { id: 1, shopName: 'Mega Supermarket', location: 'Kampala Road', products: 'Rice, Beans, Cooking Oil', amount: 'UGX 2,450,000', status: 'pending', priority: 'urgent', phone: '+256 771 123456', lat: 0.3132, lng: 32.5814, paid: true, region: 'Central' },
  { id: 2, shopName: 'Nakasero Market', location: 'Nakasero', products: 'Maize Flour, Sugar', amount: 'UGX 890,000', status: 'in-progress', priority: 'today', phone: '+256 772 234567', lat: 0.3180, lng: 32.5760, paid: false, region: 'Central' },
  { id: 3, shopName: 'Kisaasi Grocers', location: 'Kisaasi', products: 'Milk, Bread, Eggs', amount: 'UGX 340,000', status: 'pending', priority: 'later', phone: '+256 773 345678', lat: 0.3380, lng: 32.5890, paid: true, region: 'North' },
  { id: 4, shopName: 'Kololo Mini Mart', location: 'Kololo', products: 'Water, Soda, Juices', amount: 'UGX 520,000', status: 'completed', priority: 'urgent', phone: '+256 774 456789', lat: 0.3270, lng: 32.5870, paid: true, region: 'Central' },
  { id: 5, shopName: 'Makindye Store', location: 'Makindye', products: 'Soap, Detergent', amount: 'UGX 180,000', status: 'pending', priority: 'today', phone: '+256 775 567890', lat: 0.2980, lng: 32.5760, paid: false, region: 'South' },
  { id: 6, shopName: 'Ntinda Supplies', location: 'Ntinda', products: 'Flour, Salt, Spices', amount: 'UGX 1,200,000', status: 'in-progress', priority: 'urgent', phone: '+256 776 678901', lat: 0.3470, lng: 32.6010, paid: true, region: 'North' },
  { id: 7, shopName: 'Wandegeya Depot', location: 'Wandegeya', products: 'Beer, Spirits', amount: 'UGX 3,100,000', status: 'pending', priority: 'later', phone: '+256 777 789012', lat: 0.3260, lng: 32.5730, paid: false, region: 'Central' }
]

const SAMPLE_REGIONS: RegionStats[] = [
  { name: 'Central', totalDeliveries: 42, totalValue: 'UGX 15.2M', topProducts: [{ name: 'Rice', count: 28, trend: 'up' }, { name: 'Cooking Oil', count: 22, trend: 'same' }, { name: 'Sugar', count: 15, trend: 'down' }], growth: 12, lat: 0.3152, lng: 32.5814 },
  { name: 'North', totalDeliveries: 28, totalValue: 'UGX 8.7M', topProducts: [{ name: 'Maize Flour', count: 20, trend: 'up' }, { name: 'Beans', count: 18, trend: 'up' }, { name: 'Milk', count: 12, trend: 'same' }], growth: 8, lat: 0.3450, lng: 32.5950 },
  { name: 'South', totalDeliveries: 18, totalValue: 'UGX 5.1M', topProducts: [{ name: 'Soap', count: 14, trend: 'same' }, { name: 'Rice', count: 10, trend: 'down' }, { name: 'Water', count: 8, trend: 'up' }], growth: -3, lat: 0.2950, lng: 32.5750 },
  { name: 'East', totalDeliveries: 22, totalValue: 'UGX 7.3M', topProducts: [{ name: 'Sugar', count: 16, trend: 'up' }, { name: 'Cooking Oil', count: 12, trend: 'same' }, { name: 'Bread', count: 9, trend: 'up' }], growth: 15, lat: 0.3200, lng: 32.6100 },
  { name: 'West', totalDeliveries: 15, totalValue: 'UGX 4.2M', topProducts: [{ name: 'Flour', count: 11, trend: 'same' }, { name: 'Eggs', count: 8, trend: 'up' }, { name: 'Milk', count: 6, trend: 'down' }], growth: 5, lat: 0.3100, lng: 32.5550 },
  { name: 'Industrial', totalDeliveries: 35, totalValue: 'UGX 22.8M', topProducts: [{ name: 'Beer', count: 25, trend: 'up' }, { name: 'Spirits', count: 18, trend: 'up' }, { name: 'Soda', count: 14, trend: 'same' }], growth: 22, lat: 0.3050, lng: 32.5650 }
]

const SAMPLE_ALERTS: Alert[] = [
  { id: 1, type: 'stock', title: 'Low Stock Alert', message: 'Cooking Oil stock running low at Nakasero warehouse', time: '2 min ago' },
  { id: 2, type: 'payment', title: 'Payment Overdue', message: 'Makindye Store payment 5 days overdue (UGX 180,000)', time: '15 min ago' },
  { id: 3, type: 'order', title: 'New Bulk Order', message: 'Mega Supermarket placed a bulk order for weekend delivery', time: '1 hour ago' }
]

// ============================================
// DISTANCE CALCULATION
// ============================================

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ============================================
// ROUTE OPTIMIZATION
// ============================================

function optimizeRoute(deliveries: Delivery[]): RouteStop[] {
  const pending = deliveries.filter(d => d.status !== 'completed')
  if (pending.length === 0) return []

  const sorted = [...pending].sort((a, b) => {
    const priorityOrder = { urgent: 0, today: 1, later: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  const stops: RouteStop[] = []
  let currentLat: number = WAREHOUSE_LOCATION.lat
  let currentLng: number = WAREHOUSE_LOCATION.lng

  const remaining = [...sorted]

  while (remaining.length > 0) {
    let nearestIndex = 0
    let nearestDist = Infinity

    remaining.forEach((delivery, index) => {
      const dist = haversineDistance(currentLat, currentLng, delivery.lat, delivery.lng)
      const priorityBoost = delivery.priority === 'urgent' ? 0.5 : delivery.priority === 'today' ? 0.8 : 1
      const adjustedDist = dist * priorityBoost
      if (adjustedDist < nearestDist) {
        nearestDist = adjustedDist
        nearestIndex = index
      }
    })

    const delivery = remaining.splice(nearestIndex, 1)[0]
    const dist = haversineDistance(currentLat, currentLng, delivery.lat, delivery.lng)
    const time = Math.max(5, Math.round(dist / 30 * 60))

    stops.push({
      order: stops.length + 1,
      delivery,
      distance: `${dist.toFixed(1)} km`,
      time: `${time} min`
    })

    currentLat = delivery.lat
    currentLng = delivery.lng
  }

  return stops
}

// ============================================
// MAIN DASHBOARD COMPONENT
// ============================================

export default function SupplierDashboard() {
  const [activeTab, setActiveTab] = useState<'deliveries' | 'regions' | 'alerts'>('deliveries')
  const [displayMode, setDisplayMode] = useState<'deliveries' | 'regions' | 'route'>('deliveries')
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [deliveries] = useState<Delivery[]>(SAMPLE_DELIVERIES)
  const [regions] = useState<RegionStats[]>(SAMPLE_REGIONS)
  const [alerts] = useState<Alert[]>(SAMPLE_ALERTS)

  const optimizedStops = useMemo(() => optimizeRoute(deliveries), [deliveries])

  const totalRevenue = deliveries.reduce((sum, d) => {
    const amount = parseFloat(d.amount.replace(/[UGX,\s]/g, ''))
    return sum + amount
  }, 0)

  const pendingCount = deliveries.filter(d => d.status === 'pending').length
  const inProgressCount = deliveries.filter(d => d.status === 'in-progress').length
  const completedCount = deliveries.filter(d => d.status === 'completed').length

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-800">DirectDDL</h1>
          <p className="text-sm text-gray-500">Supplier Dashboard - Kampala</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(['deliveries', 'regions', 'alerts'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
              {tab === 'alerts' && alerts.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{alerts.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'deliveries' && (
            <div className="space-y-3">
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-amber-600">{pendingCount}</div>
                  <div className="text-xs text-amber-500">Pending</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-blue-600">{inProgressCount}</div>
                  <div className="text-xs text-blue-500">Active</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-green-600">{completedCount}</div>
                  <div className="text-xs text-green-500">Done</div>
                </div>
              </div>

              {/* Optimize Route Button */}
              <button
                onClick={() => setDisplayMode('route')}
                className={`w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                  displayMode === 'route'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                </svg>
                Optimize Route ({optimizedStops.length} stops)
              </button>

              {/* Delivery Cards */}
              {deliveries.map(delivery => (
                <div key={delivery.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-800 text-sm">{delivery.shopName}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{delivery.location}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      delivery.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                      delivery.priority === 'today' ? 'bg-amber-100 text-amber-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {delivery.priority}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">{delivery.products}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-semibold text-gray-700">{delivery.amount}</span>
                    <span className={`text-xs ${delivery.paid ? 'text-green-500' : 'text-red-500'}`}>
                      {delivery.paid ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'regions' && (
            <div className="space-y-3">
              {regions.map(region => (
                <div key={region.name} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-800">{region.name}</div>
                    <span className={`text-sm font-bold ${region.growth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {region.growth >= 0 ? '+' : ''}{region.growth}%
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{region.totalDeliveries} deliveries</div>
                  <div className="text-sm text-gray-700 font-medium">{region.totalValue}</div>
                  <div className="flex gap-2 mt-2">
                    {region.topProducts.slice(0, 3).map(product => (
                      <span key={product.name} className="text-xs px-2 py-1 bg-white rounded-full border border-gray-200">
                        {product.name} ({product.count})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-3">
              {alerts.map(alert => (
                <div key={alert.id} className={`p-4 rounded-xl border ${
                  alert.type === 'stock' ? 'bg-amber-50 border-amber-100' :
                  alert.type === 'payment' ? 'bg-red-50 border-red-100' :
                  'bg-blue-50 border-blue-100'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="font-semibold text-gray-800 text-sm">{alert.title}</div>
                    <span className="text-xs text-gray-400">{alert.time}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{alert.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue Summary */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <div className="text-xs text-gray-500">Total Revenue</div>
          <div className="text-lg font-bold text-gray-800">UGX {(totalRevenue / 1000000).toFixed(1)}M</div>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative">
        <MapComponent
          deliveries={deliveries}
          regions={regions}
          optimizedStops={optimizedStops}
          viewMode={viewMode}
          displayMode={displayMode}
          onSwitchTo3D={() => setViewMode('3d')}
          onSwitchTo2D={() => setViewMode('2d')}
        />

        {/* Display Mode Buttons */}
        <div className="absolute top-4 left-4 z-[1000] flex gap-2">
          {(['deliveries', 'regions', 'route'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setDisplayMode(mode)}
              className={`px-4 py-2 rounded-lg shadow-md text-sm font-medium capitalize transition-all ${
                displayMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
