'use client'

/**
 * Turn-by-Turn Panel - v5.0
 *
 * Displays the next turn instruction and turn list
 * during active 3D navigation.
 */

import type { TurnInstruction } from '@/types/map'

interface TurnByTurnPanelProps {
  isNightMode: boolean
  currentStreet: string
  nextTurn: TurnInstruction | null
  distanceRemaining: string
  timeRemaining: string
  arrivingIn: string
  turnInstructions: TurnInstruction[]
  showInstructions: boolean
  onToggleInstructions: () => void
}

// Turn icon components
function TurnIcon({ maneuver, modifier }: { maneuver: string; modifier?: string }) {
  const size = 28

  if (maneuver === 'turn') {
    if (modifier === 'left') {
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
    }
    if (modifier === 'right') {
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
    }
    if (modifier === 'slight left') {
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 17L7 7"/><path d="M7 17V7h10"/></svg>
    }
    if (modifier === 'slight right') {
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
    }
  }

  if (maneuver === 'roundabout') {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/></svg>
  }

  if (maneuver === 'arrive') {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  }

  // Default: continue straight
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export default function TurnByTurnPanel({
  isNightMode,
  currentStreet,
  nextTurn,
  distanceRemaining,
  timeRemaining,
  arrivingIn,
  turnInstructions,
  showInstructions,
  onToggleInstructions
}: TurnByTurnPanelProps) {
  if (!nextTurn) return null

  return (
    <div className="absolute left-4 top-20 w-72 z-20">
      {/* Current Street & Next Turn */}
      <div className={`rounded-xl shadow-lg overflow-hidden ${
        isNightMode ? 'bg-gray-800/95' : 'bg-white/95'
      } backdrop-blur-sm`}>
        <div className="p-4">
          {/* Current Street */}
          <div className={`text-xs font-medium mb-2 ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Current Street
          </div>
          <div className={`text-sm font-semibold mb-3 ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
            {currentStreet || 'Unknown Road'}
          </div>

          {/* Next Turn */}
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
              isNightMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-blue-600'
            }`}>
              <TurnIcon maneuver={nextTurn.maneuver} modifier={nextTurn.modifier} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
                {nextTurn.instruction || 'Continue'}
              </div>
              {nextTurn.distance > 0 && (
                <div className={`text-xs ${isNightMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  In {formatDistance(nextTurn.distance)}
                </div>
              )}
            </div>
          </div>

          {/* ETA Bar */}
          <div className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${
            isNightMode ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-50 text-gray-600'
          }`}>
            <span>{distanceRemaining} left</span>
            <span>{timeRemaining}</span>
            <span className="font-semibold text-blue-500">ETA {arrivingIn}</span>
          </div>
        </div>

        {/* Toggle Instructions */}
        <button
          onClick={onToggleInstructions}
          className={`w-full py-2 text-xs font-medium border-t ${
            isNightMode
              ? 'border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700/50'
              : 'border-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          } transition-all`}
        >
          {showInstructions ? 'Hide' : 'Show'} Turn List ({turnInstructions.length})
        </button>
      </div>

      {/* Turn Instructions List */}
      {showInstructions && turnInstructions.length > 0 && (
        <div className={`mt-2 max-h-60 overflow-y-auto rounded-xl shadow-lg ${
          isNightMode ? 'bg-gray-800/95' : 'bg-white/95'
        } backdrop-blur-sm`}>
          <div className="py-2">
            {turnInstructions.map((instruction, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 px-4 py-2 ${
                  isNightMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
                } transition-colors`}
              >
                <div className={`flex-shrink-0 ${isNightMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <TurnIcon maneuver={instruction.maneuver} modifier={instruction.modifier} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium truncate ${isNightMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {instruction.instruction || 'Continue'}
                  </div>
                  {instruction.distance > 0 && (
                    <div className={`text-xs ${isNightMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {formatDistance(instruction.distance)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
