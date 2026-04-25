'use client'

import { useState, useCallback } from 'react'
import type { AIQualityLevel, AIEnhancementMode } from '@/types/map'

/**
 * Tile Enhancement Toggle - v5.0
 *
 * A reusable UI widget for controlling AI tile enhancement.
 * Provides toggle, quality selector, mode selector, and
 * enhancement status display.
 *
 * Used in both the sidebar and the 3D navigation overlay.
 */

interface TileEnhancementToggleProps {
  enabled: boolean
  quality: AIQualityLevel
  mode: AIEnhancementMode
  isEnhancing: boolean
  stats?: {
    aiHits: number
    canvasHits: number
    webglHits: number
    queueLength: number
    activeRequests: number
  }
  onToggle: (enabled: boolean) => void
  onQualityChange: (quality: AIQualityLevel) => void
  onModeChange: (mode: AIEnhancementMode) => void
  compact?: boolean
  className?: string
}

const MODE_LABELS: Record<AIEnhancementMode, string> = {
  'photorealistic': 'Photorealistic',
  'enhanced-satellite': 'Enhanced Satellite',
  'urban-detail': 'Urban Detail',
  'terrain-clarity': 'Terrain Clarity'
}

const QUALITY_LABELS: Record<AIQualityLevel, string> = {
  'standard': 'Standard',
  'high': 'High',
  'ultra': 'Ultra'
}

export default function TileEnhancementToggle({
  enabled,
  quality,
  mode,
  isEnhancing,
  stats,
  onToggle,
  onQualityChange,
  onModeChange,
  compact = false,
  className = ''
}: TileEnhancementToggleProps) {
  const [showSettings, setShowSettings] = useState(false)

  const handleToggle = useCallback(() => {
    onToggle(!enabled)
  }, [enabled, onToggle])

  return (
    <div className={`relative ${className}`}>
      {/* Main Toggle Button */}
      <button
        onClick={handleToggle}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs font-medium transition-all ${
          enabled
            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
            : 'bg-white text-gray-700 hover:bg-gray-50'
        } ${compact ? 'px-2 py-1.5' : ''}`}
        title={enabled ? 'AI Enhancement is ON' : 'AI Enhancement is OFF'}
      >
        {/* Sparkle Icon */}
        <svg width={compact ? 12 : 16} height={compact ? 12 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
        </svg>
        <span>AI {enabled ? 'ON' : 'OFF'}</span>
        {isEnhancing && (
          <div className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
        )}
      </button>

      {/* Settings Expand Button */}
      {enabled && !compact && (
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="ml-1 w-8 h-8 rounded-lg shadow-lg bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center transition-all"
          title="AI Enhancement Settings"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      )}

      {/* Settings Dropdown */}
      {showSettings && enabled && !compact && (
        <div className="absolute top-full mt-2 right-0 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-800">AI Enhancement</h4>
            <button
              onClick={() => setShowSettings(false)}
              aria-label="Close AI enhancement settings"
              className="text-gray-400 hover:text-gray-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Mode Selector */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Mode</label>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(MODE_LABELS) as AIEnhancementMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => onModeChange(m)}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                    mode === m
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Quality Selector */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Quality</label>
            <div className="flex gap-1">
              {(Object.keys(QUALITY_LABELS) as AIQualityLevel[]).map((q) => (
                <button
                  key={q}
                  onClick={() => onQualityChange(q)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                    quality === q
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {QUALITY_LABELS[q]}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="border-t border-gray-100 pt-3">
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Stats</label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                <span>AI Hits:</span><span className="text-right font-mono">{stats.aiHits}</span>
                <span>WebGL Hits:</span><span className="text-right font-mono">{stats.webglHits}</span>
                <span>Canvas Hits:</span><span className="text-right font-mono">{stats.canvasHits}</span>
                <span>In Queue:</span><span className="text-right font-mono">{stats.queueLength}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}