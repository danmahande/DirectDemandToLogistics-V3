'use client'

import { BUILDING_HEIGHT_RANGES } from '@/lib/config'
import type { MapStyleConfig } from '@/types/map'

// ═══════════════════════════════════════════════════════════
// BUILDING LEGEND COMPONENT
// ═══════════════════════════════════════════════════════════
// Displays a color-coded legend for building heights
// on the 3D map. Shows height ranges with descriptions.
// ═══════════════════════════════════════════════════════════

interface BuildingLegendProps {
  nightMode: boolean
  heightExaggeration: number
  buildingCount?: number
  className?: string
}

export default function BuildingLegend({
  nightMode,
  heightExaggeration,
  buildingCount,
  className = '',
}: BuildingLegendProps) {
  return (
    <div className={`bg-white/95 backdrop-blur-md rounded-xl shadow-lg p-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21h18"/>
            <path d="M5 21V7l8-4v18"/>
            <path d="M19 21V11l-6-4"/>
          </svg>
          Building Heights
        </h4>
        {heightExaggeration !== 1.0 && (
          <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
            {heightExaggeration.toFixed(1)}x
          </span>
        )}
      </div>

      {/* Color Scale */}
      <div className="flex gap-0.5 mb-1.5">
        {BUILDING_HEIGHT_RANGES.map((range, i) => (
          <div
            key={i}
            className="flex-1 h-4 rounded-sm cursor-pointer hover:scale-y-125 transition-transform"
            style={{
              background: nightMode ? range.nightColor : range.color,
            }}
            title={`${range.label} — ${range.description}`}
          />
        ))}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[9px] text-gray-400 mb-2">
        <span>0m</span>
        <span>20m</span>
        <span>40m</span>
        <span>60m</span>
        <span>80m+</span>
      </div>

      {/* Detailed Legend */}
      <div className="space-y-1">
        {BUILDING_HEIGHT_RANGES.map((range, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ background: nightMode ? range.nightColor : range.color }}
            />
            <span className="text-[10px] text-gray-600 flex-1">{range.label}</span>
            <span className="text-[10px] text-gray-400">{range.description}</span>
          </div>
        ))}
      </div>

      {/* Building Count */}
      {buildingCount !== undefined && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-center">
          <span className="text-[10px] text-gray-500">
            {buildingCount} buildings in view
          </span>
        </div>
      )}

      {/* Data Source Note */}
      <div className="mt-2 text-[9px] text-gray-400 text-center">
        Data: OpenFreeMap / OpenStreetMap
      </div>
    </div>
  )
}
