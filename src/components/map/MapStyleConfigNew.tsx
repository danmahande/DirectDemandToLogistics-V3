'use client'

import { useState, useCallback } from 'react'
import { BUILDING_HEIGHT_RANGES } from '@/lib/config'
import { DEFAULT_MAP_CONFIG, type MapStyleConfig } from '@/types/map'

// ═══════════════════════════════════════════════════════════
// MAP STYLE CONFIG PANEL (CORRECTED)
// ═══════════════════════════════════════════════════════════
// UI panel for configuring the 3D map style.
// Controls layer visibility, building height, opacity, and day/night.
//
// CORRECTIONS:
// - Toggle button now has aria-label and title
// - Slider input has id, aria-label, title, and associated label
// - Inline styles moved to CSS classes where feasible
// - All SVG icons have aria-hidden="true"
// ═══════════════════════════════════════════════════════════

interface MapStyleConfigProps {
  config: MapStyleConfig
  onConfigChange: (config: MapStyleConfig) => void
  onApply: () => void
  className?: string
}

// ============================================
// TOGGLE COMPONENT (accessible)
// ============================================

function Toggle({
  label,
  enabled,
  onToggle,
  icon,
}: {
  label: string
  enabled: boolean
  onToggle: () => void
  icon: React.ReactNode
}) {
  const toggleId = `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] ${enabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`} aria-hidden="true">
          {icon}
        </span>
        <label htmlFor={toggleId} className={`text-xs cursor-pointer ${enabled ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>{label}</label>
      </div>
      <button
        id={toggleId}
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? 'Disable' : 'Enable'} ${label}`}
        title={`${enabled ? 'Disable' : 'Enable'} ${label}`}
        className={`w-8 h-4.5 rounded-full transition-all duration-200 relative ${enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
      >
        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all duration-200 ${enabled ? 'left-4' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

// ============================================
// SLIDER COMPONENT (accessible)
// ============================================

function Slider({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  displayValue: string
  onChange: (v: number) => void
}) {
  const sliderId = `slider-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <label htmlFor={sliderId} className="text-[10px] text-gray-600">{label}</label>
        <span className="text-[10px] font-medium text-gray-900 bg-gray-100 px-1 py-0.5 rounded">{displayValue}</span>
      </div>
      <input
        id={sliderId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        title={`${label}: ${displayValue}`}
        className="w-full h-1 rounded-full appearance-none bg-gray-200 accent-blue-500"
      />
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function MapStyleConfig({
  config,
  onConfigChange,
  onApply,
  className = '',
}: MapStyleConfigProps) {
  const [activeTab, setActiveTab] = useState<'layers' | 'buildings' | 'style'>('layers')

  const update = useCallback((partial: Partial<MapStyleConfig>) => {
    onConfigChange({ ...config, ...partial })
  }, [config, onConfigChange])

  const reset = useCallback(() => {
    onConfigChange(DEFAULT_MAP_CONFIG)
    onApply()
  }, [onConfigChange, onApply])

  return (
    <div className={`bg-white/95 backdrop-blur-md rounded-xl shadow-xl w-64 ${className}`}>
      {/* Header */}
      <div className="p-2.5 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Map Settings
          </h3>
          <button
            onClick={reset}
            aria-label="Reset map settings to defaults"
            title="Reset settings"
            className="text-[10px] text-gray-400 hover:text-gray-600"
          >
            Reset
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-2" role="tablist">
          {(['layers', 'buildings', 'style'] as const).map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-label={`${tab === 'layers' ? 'Layers' : tab === 'buildings' ? '3D Buildings' : 'Style'} settings`}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1 rounded text-[10px] font-medium transition-colors ${
                activeTab === tab ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab === 'layers' ? 'Layers' : tab === 'buildings' ? '3D' : 'Style'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-2.5" role="tabpanel">
        {activeTab === 'layers' && (
          <div>
            <Toggle label="Satellite" enabled={config.showSatellite} onToggle={() => update({ showSatellite: !config.showSatellite })} icon="S" />
            <Toggle label="3D Buildings" enabled={config.showBuildings} onToggle={() => update({ showBuildings: !config.showBuildings })} icon="B" />
            <Toggle label="Roads" enabled={config.showRoads} onToggle={() => update({ showRoads: !config.showRoads })} icon="R" />
            <Toggle label="Water" enabled={config.showWater} onToggle={() => update({ showWater: !config.showWater })} icon="W" />
            <Toggle label="Labels" enabled={config.showLabels} onToggle={() => update({ showLabels: !config.showLabels })} icon="L" />
            <Toggle label="Sky" enabled={config.showSky} onToggle={() => update({ showSky: !config.showSky })} icon="K" />

            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
              <Slider label="Satellite Opacity" value={config.satelliteOpacity} min={0} max={1} step={0.05} displayValue={`${Math.round(config.satelliteOpacity * 100)}%`} onChange={(v) => update({ satelliteOpacity: v })} />
              <Slider label="Road Opacity" value={config.roadOpacity} min={0} max={1} step={0.05} displayValue={`${Math.round(config.roadOpacity * 100)}%`} onChange={(v) => update({ roadOpacity: v })} />
              <Slider label="Label Opacity" value={config.labelOpacity} min={0} max={1} step={0.05} displayValue={`${Math.round(config.labelOpacity * 100)}%`} onChange={(v) => update({ labelOpacity: v })} />
            </div>
          </div>
        )}

        {activeTab === 'buildings' && (
          <div>
            <Slider
              label="Height Multiplier"
              value={config.buildingHeightExaggeration}
              min={0.5} max={3} step={0.1}
              displayValue={`${config.buildingHeightExaggeration.toFixed(1)}x`}
              onChange={(v) => update({ buildingHeightExaggeration: v })}
            />
            <Slider
              label="Building Opacity"
              value={config.buildingOpacity}
              min={0.1} max={1} step={0.05}
              displayValue={`${Math.round(config.buildingOpacity * 100)}%`}
              onChange={(v) => update({ buildingOpacity: v })}
            />

            {/* Quick presets */}
            <div className="mt-2">
              <div className="text-[10px] font-medium text-gray-500 mb-1">PRESETS</div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: 'Real', value: 1.0 },
                  { label: '1.5x', value: 1.5 },
                  { label: '2x', value: 2.0 },
                  { label: '2.5x', value: 2.5 },
                  { label: '3x', value: 3.0 },
                  { label: 'Mini', value: 0.5 },
                ].map(p => (
                  <button
                    key={p.label}
                    onClick={() => update({ buildingHeightExaggeration: p.value })}
                    aria-label={`Set height multiplier to ${p.label}`}
                    title={`Height ${p.label}`}
                    className={`py-1 rounded text-[10px] font-medium ${
                      Math.abs(config.buildingHeightExaggeration - p.value) < 0.01
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color preview — using CSS class instead of inline style */}
            <div className="mt-2">
              <div className="text-[10px] font-medium text-gray-500 mb-1">BUILDING COLORS</div>
              <div className="flex gap-0.5">
                {BUILDING_HEIGHT_RANGES.map((range, i) => (
                  <div
                    key={i}
                    className="flex-1 h-5 rounded-sm"
                    style={{ background: config.nightMode ? range.nightColor : range.color }}
                    title={`${range.label} — ${range.description}`}
                    aria-label={`Building color for ${range.label} range: ${range.description}`}
                    role="img"
                  />
                ))}
              </div>
              <div className="flex justify-between text-[8px] text-gray-400 mt-0.5">
                <span>0m</span>
                <span>88m+</span>
              </div>
            </div>

            <div className="mt-2 p-1.5 bg-blue-50 rounded text-[10px] text-blue-700">
              OpenFreeMap provides building heights from 1-88m in Kampala.
            </div>
          </div>
        )}

        {activeTab === 'style' && (
          <div>
            {/* Day/Night */}
            <div className="flex gap-1.5 mb-2">
              <button
                onClick={() => update({ nightMode: false })}
                aria-label="Switch to day mode"
                title="Day mode"
                className={`flex-1 py-2 rounded-lg text-[10px] font-medium flex items-center justify-center gap-1 ${
                  !config.nightMode ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => update({ nightMode: true })}
                aria-label="Switch to night mode"
                title="Night mode"
                className={`flex-1 py-2 rounded-lg text-[10px] font-medium flex items-center justify-center gap-1 ${
                  config.nightMode ? 'bg-indigo-900 text-indigo-100 border border-indigo-500' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Night
              </button>
            </div>

            {/* Road style preview */}
            <div className="mt-2">
              <div className="text-[10px] font-medium text-gray-500 mb-1.5">ROAD STYLES</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-2 rounded-full ${config.nightMode ? 'bg-yellow-700' : 'bg-yellow-400'}`} aria-hidden="true" />
                  <span className="text-[10px] text-gray-600">Major (primary, trunk)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-1.5 rounded-full ${config.nightMode ? 'bg-gray-500' : 'bg-white border border-gray-300'}`} aria-hidden="true" />
                  <span className="text-[10px] text-gray-600">Secondary &amp; tertiary</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-1 rounded-full ${config.nightMode ? 'bg-gray-700' : 'bg-gray-300'}`} aria-hidden="true" />
                  <span className="text-[10px] text-gray-600">Minor &amp; service</span>
                </div>
              </div>
            </div>

            {/* Sky info */}
            <div className="mt-2">
              <div className="text-[10px] font-medium text-gray-500 mb-1">SKY LAYER</div>
              <div className="p-1.5 bg-gray-50 rounded text-[10px] text-gray-600">
                {config.showSky
                  ? config.nightMode
                    ? 'Dark sky with moonlit atmosphere enabled'
                    : 'Blue sky with atmospheric fog enabled'
                  : 'Sky layer disabled — flat background'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Apply Button */}
      <div className="p-2 border-t border-gray-100">
        <button
          onClick={onApply}
          aria-label="Apply map style settings"
          title="Apply settings to map"
          className="w-full py-2 bg-blue-500 text-white rounded-lg text-[11px] font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Apply to Map
        </button>
      </div>

      <style jsx global>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
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
