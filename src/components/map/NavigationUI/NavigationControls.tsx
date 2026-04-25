'use client'

/**
 * Navigation Controls - v5.0
 *
 * Top bar navigation controls for the 3D navigation view.
 * Includes exit button, AI enhancement toggle, display mode buttons,
 * and traffic/POI toggle controls.
 */

import TileEnhancementToggle from '@/components/ui/TileEnhancementToggle'
import type { AIQualityLevel, AIEnhancementMode } from '@/types/map'

interface NavigationControlsProps {
  isNightMode: boolean
  useEnhancedTiles: boolean
  aiQuality: AIQualityLevel
  aiMode: AIEnhancementMode
  isEnhancing: boolean
  showTraffic: boolean
  showPOIs: boolean
  stats?: {
    aiHits: number
    canvasHits: number
    webglHits: number
    queueLength: number
    activeRequests: number
  }
  onExit: () => void
  onToggleEnhancement: (enabled: boolean) => void
  onQualityChange: (quality: AIQualityLevel) => void
  onModeChange: (mode: AIEnhancementMode) => void
  onToggleTraffic: () => void
  onTogglePOIs: () => void
}

export default function NavigationControls({
  isNightMode,
  useEnhancedTiles,
  aiQuality,
  aiMode,
  isEnhancing,
  showTraffic,
  showPOIs,
  stats,
  onExit,
  onToggleEnhancement,
  onQualityChange,
  onModeChange,
  onToggleTraffic,
  onTogglePOIs
}: NavigationControlsProps) {
  return (
    <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
      {/* Exit Button */}
      <button
        onClick={onExit}
        className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all ${
          isNightMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
        }`}
        title="Exit navigation"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={isNightMode ? 'text-white' : 'text-gray-600'}>
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      {/* Right-side Controls */}
      <div className="flex gap-2 items-start">
        {/* AI Enhancement Toggle */}
        <TileEnhancementToggle
          enabled={useEnhancedTiles}
          quality={aiQuality}
          mode={aiMode}
          isEnhancing={isEnhancing}
          stats={stats}
          onToggle={onToggleEnhancement}
          onQualityChange={onQualityChange}
          onModeChange={onModeChange}
        />

        {/* Traffic Toggle */}
        <button
          onClick={onToggleTraffic}
          className={`px-3 py-2 rounded-lg shadow-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
            showTraffic
              ? 'bg-green-500 text-white hover:bg-green-600'
              : isNightMode
                ? 'bg-gray-700 text-white hover:bg-gray-600'
                : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title="Toggle traffic data"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2" width="10" height="20" rx="2"/>
            <circle cx="12" cy="7" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="12" cy="17" r="2"/>
          </svg>
          Traffic
        </button>

        {/* POI Toggle */}
        <button
          onClick={onTogglePOIs}
          className={`px-3 py-2 rounded-lg shadow-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
            showPOIs
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : isNightMode
                ? 'bg-gray-700 text-white hover:bg-gray-600'
                : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title="Toggle POI markers"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          POI
        </button>
      </div>
    </div>
  )
}
