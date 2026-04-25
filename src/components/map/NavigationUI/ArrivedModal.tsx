'use client'

/**
 * Arrived Modal - v5.0
 *
 * Celebration modal shown when the vehicle arrives
 * at the final delivery destination.
 */

interface ArrivedModalProps {
  isNightMode: boolean
  stopName: string
  stopOrder: number
  totalStops: number
  distanceTraveled: string
  timeElapsed: string
  onClose: () => void
  onContinue?: () => void
  onExit: () => void
}

export default function ArrivedModal({
  isNightMode,
  stopName,
  stopOrder,
  totalStops,
  distanceTraveled,
  timeElapsed,
  onClose,
  onContinue,
  onExit
}: ArrivedModalProps) {
  const isLastStop = stopOrder >= totalStops

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-sm">
      <div className={`w-80 rounded-2xl shadow-2xl overflow-hidden ${
        isNightMode ? 'bg-gray-800' : 'bg-white'
      }`}>
        {/* Celebration Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-center text-white">
          <div className="text-4xl mb-2">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold">
            {isLastStop ? 'Route Complete!' : 'Arrived!'}
          </h2>
          <p className="text-sm text-green-100 mt-1">
            {isLastStop ? 'All deliveries completed' : `Stop ${stopOrder} of ${totalStops}`}
          </p>
        </div>

        {/* Details */}
        <div className="p-6">
          <div className={`text-center mb-4 ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
            <div className="text-lg font-semibold">{stopName}</div>
          </div>

          <div className={`grid grid-cols-2 gap-4 mb-6 ${isNightMode ? 'text-gray-300' : 'text-gray-600'}`}>
            <div className="text-center">
              <div className={`text-lg font-bold ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
                {distanceTraveled}
              </div>
              <div className="text-xs">Distance</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${isNightMode ? 'text-white' : 'text-gray-800'}`}>
                {timeElapsed}
              </div>
              <div className="text-xs">Time</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onExit}
              className={`flex-1 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                isNightMode
                  ? 'bg-gray-700 text-white hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Exit Navigation
            </button>

            {!isLastStop && onContinue && (
              <button
                onClick={onContinue}
                className="flex-1 px-4 py-3 rounded-xl font-medium text-sm bg-green-500 text-white hover:bg-green-600 transition-all"
              >
                Next Stop
              </button>
            )}

            {isLastStop && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl font-medium text-sm bg-blue-500 text-white hover:bg-blue-600 transition-all"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
