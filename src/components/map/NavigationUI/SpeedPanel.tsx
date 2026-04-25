'use client'

/**
 * Speed Panel - v5.0
 *
 * Displays the current navigation speed, animation progress,
 * and playback controls (play/pause, speed selector).
 */

interface SpeedPanelProps {
  isNightMode: boolean
  currentSpeed: number
  isAnimating: boolean
  animationProgress: number
  isNavigating: boolean
  speedMultiplier: number
  onToggleAnimation: () => void
  onSpeedChange: (multiplier: number) => void
  onStartNavigation: () => void
}

export default function SpeedPanel({
  isNightMode,
  currentSpeed,
  isAnimating,
  animationProgress,
  isNavigating,
  speedMultiplier,
  onToggleAnimation,
  onSpeedChange,
  onStartNavigation
}: SpeedPanelProps) {
  if (!isNavigating) return null

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
      <div className={`flex items-center gap-4 px-5 py-3 rounded-2xl shadow-lg ${
        isNightMode ? 'bg-gray-800/95' : 'bg-white/95'
      } backdrop-blur-sm`}>
        {/* Speed Display */}
        <div className="flex items-center gap-2">
          <div className={`text-2xl font-bold tabular-nums ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
            {currentSpeed}
          </div>
          <div className={`text-xs ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
            km/h
          </div>
        </div>

        {/* Divider */}
        <div className={`w-px h-8 ${isNightMode ? 'bg-gray-600' : 'bg-gray-200'}`} />

        {/* Play/Pause */}
        <button
          onClick={onToggleAnimation}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
            isAnimating
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-green-500 text-white hover:bg-green-600'
          }`}
          title={isAnimating ? 'Pause' : 'Play'}
        >
          {isAnimating ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"/>
              <rect x="14" y="4" width="4" height="16"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          )}
        </button>

        {/* Speed Multiplier */}
        <div className="flex items-center gap-1">
          {[1, 2, 4].map((speed) => (
            <button
              key={speed}
              onClick={() => onSpeedChange(speed)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                speedMultiplier === speed
                  ? 'bg-blue-500 text-white'
                  : isNightMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        {/* Progress Bar */}
        <div className={`w-32 h-2 rounded-full overflow-hidden ${isNightMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-green-500 to-red-500 rounded-full transition-all"
            style={{ width: `${Math.round(animationProgress * 100)}%` }}
          />
        </div>
        <div className={`text-xs tabular-nums ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {Math.round(animationProgress * 100)}%
        </div>
      </div>
    </div>
  )
}
