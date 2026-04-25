/**
 * AI Tile Generation Service - v5.0
 *
 * A clean service layer for AI-based map tile enhancement.
 * Provides a higher-level API than the raw tile enhancer,
 * including batch operations, status tracking, and retry logic.
 *
 * This service coordinates between:
 * - The client-side AITileEnhancer (WebGL/Canvas + caching + protocol)
 * - The server-side AI generation API (VLM analysis + image generation)
 * - The UI components (status updates, progress tracking)
 */

import {
  getTileEnhancer,
  buildEnhancementPrompt,
  buildOriginalTileUrl,
} from '@/lib/ai-tile-enhancer'
import type {
  AIQualityLevel,
  AIEnhancementMode
} from '@/types/map'

// ============================================
// TYPES
// ============================================

export interface EnhancementJob {
  id: string
  z: number
  x: number
  y: number
  status: 'queued' | 'analyzing' | 'generating' | 'completed' | 'failed'
  progress: number
  originalUrl: string
  quality: AIQualityLevel
  mode: AIEnhancementMode
  prompt: string
  startedAt?: number
  completedAt?: number
  error?: string
  resultUrl?: string
}

export interface EnhancementBatch {
  id: string
  jobs: EnhancementJob[]
  totalTiles: number
  completedTiles: number
  failedTiles: number
  status: 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed'
  startedAt?: number
  completedAt?: number
}

export type EnhancementStatusListener = (status: EnhancementStatus) => void

export interface EnhancementStatus {
  isEnhancing: boolean
  activeJobs: number
  queuedJobs: number
  completedJobs: number
  failedJobs: number
  currentBatch?: EnhancementBatch
  enhancementMode: AIEnhancementMode
  qualityLevel: AIQualityLevel
  region: string
  cacheStats: {
    memorySize: number
    maxMemory: number
  }
  enhancerStats: {
    canvasHits: number
    webglHits: number
    aiHits: number
    aiRequests: number
    aiFailures: number
    avgProcessingTime: number
    queueLength: number
    activeRequests: number
    protocolIntercepts: number
  }
}

// ============================================
// AI ENHANCEMENT SERVICE
// ============================================

class AITileGenerationServiceImpl {
  private listeners: Set<EnhancementStatusListener> = new Set()
  private currentBatch: EnhancementBatch | null = null
  private jobHistory: Map<string, EnhancementJob> = new Map()
  private retryCount: Map<string, number> = new Map()
  private maxRetries = 2
  private retryDelayMs = 2000
  private pollIntervalId: ReturnType<typeof setInterval> | null = null

  /**
   * Initialize the service with configuration
   */
  init(config?: {
    region?: string
    quality?: AIQualityLevel
    mode?: AIEnhancementMode
    tileSourceUrl?: string
  }) {
    const enhancer = getTileEnhancer({
      region: config?.region,
      quality: config?.quality,
      mode: config?.mode,
      tileSourceUrl: config?.tileSourceUrl
    })

    this.startStatusPolling()
    return enhancer
  }

  // ============================================
  // STATUS MANAGEMENT
  // ============================================

  onStatusChange(listener: EnhancementStatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getStatus(): EnhancementStatus {
    const enhancer = getTileEnhancer()
    const stats = enhancer.getStats()

    return {
      isEnhancing: stats.activeRequests > 0 || stats.queueLength > 0,
      activeJobs: stats.activeRequests,
      queuedJobs: stats.queueLength,
      completedJobs: stats.aiHits,
      failedJobs: stats.aiFailures,
      currentBatch: this.currentBatch || undefined,
      enhancementMode: enhancer.getConfig().mode,
      qualityLevel: enhancer.getConfig().quality,
      region: enhancer.getConfig().region || 'Kampala, Uganda',
      cacheStats: {
        memorySize: 0,
        maxMemory: 500
      },
      enhancerStats: stats
    }
  }

  private notifyListeners() {
    const status = this.getStatus()
    this.listeners.forEach(listener => {
      try {
        listener(status)
      } catch (error) {
        console.warn('[AITileGenerationService] Listener error:', error)
      }
    })
  }

  private startStatusPolling() {
    if (this.pollIntervalId) return
    this.pollIntervalId = setInterval(() => {
      this.notifyListeners()
    }, 2000)
  }

  stopStatusPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId)
      this.pollIntervalId = null
    }
  }

  // ============================================
  // SINGLE TILE ENHANCEMENT
  // ============================================

  async enhanceTile(
    z: number,
    x: number,
    y: number,
    options?: {
      quality?: AIQualityLevel
      mode?: AIEnhancementMode
      region?: string
      customPrompt?: string
    }
  ): Promise<Blob> {
    const enhancer = getTileEnhancer()

    if (options?.quality) enhancer.setAIQuality(options.quality)
    if (options?.mode) enhancer.setAIMode(options.mode)
    if (options?.region) enhancer.setRegion(options.region)
    if (options?.customPrompt) enhancer.setCustomPrompt(options.customPrompt)

    return enhancer.forceAIEnhance(z, x, y)
  }

  async isTileEnhanced(z: number, x: number, y: number): Promise<boolean> {
    const enhancer = getTileEnhancer()
    const cached = await enhancer.getCachedTile(z, x, y)
    return cached !== null
  }

  // ============================================
  // BATCH ENHANCEMENT
  // ============================================

  async enhanceBatch(
    tiles: Array<{ z: number; x: number; y: number }>,
    options?: {
      quality?: AIQualityLevel
      mode?: AIEnhancementMode
      region?: string
      concurrency?: number
      onProgress?: (completed: number, total: number) => void
    }
  ): Promise<EnhancementBatch> {
    const batchId = `batch-${Date.now()}`
    const enhancer = getTileEnhancer()

    if (options?.quality) enhancer.setAIQuality(options.quality)
    if (options?.mode) enhancer.setAIMode(options.mode)
    if (options?.region) enhancer.setRegion(options.region)

    const jobs: EnhancementJob[] = tiles.map((tile, index) => {
      const originalUrl = buildOriginalTileUrl(
        enhancer.getConfig().tileSourceUrl,
        tile.z, tile.x, tile.y
      )
      const prompt = buildEnhancementPrompt(
        tile.z, tile.x, tile.y,
        enhancer.getConfig().mode,
        enhancer.getConfig().region,
        enhancer.getConfig().customPrompt
      )

      return {
        id: `${batchId}-${index}`,
        z: tile.z,
        x: tile.x,
        y: tile.y,
        status: 'queued' as const,
        progress: 0,
        originalUrl,
        quality: enhancer.getConfig().quality,
        mode: enhancer.getConfig().mode,
        prompt
      }
    })

    const batch: EnhancementBatch = {
      id: batchId,
      jobs,
      totalTiles: tiles.length,
      completedTiles: 0,
      failedTiles: 0,
      status: 'pending',
      startedAt: Date.now()
    }

    this.currentBatch = batch

    const concurrency = options?.concurrency || 2
    let nextIndex = 0

    const processNext = async (): Promise<void> => {
      while (nextIndex < jobs.length) {
        const currentIndex = nextIndex++
        const job = jobs[currentIndex]

        if (job.status === 'completed' || job.status === 'failed') continue

        try {
          job.status = 'analyzing'
          job.progress = 10
          job.startedAt = Date.now()
          this.notifyListeners()

          const response = await fetch('/api/generate-tile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              z: job.z,
              x: job.x,
              y: job.y,
              originalUrl: job.originalUrl,
              quality: job.quality,
              mode: job.mode,
              prompt: job.prompt,
              region: enhancer.getConfig().region
            })
          })

          if (!response.ok) {
            throw new Error(`AI enhancement failed: ${response.status}`)
          }

          job.status = 'generating'
          job.progress = 50
          this.notifyListeners()

          await enhancer.forceAIEnhance(job.z, job.x, job.y)

          job.status = 'completed'
          job.progress = 100
          job.completedAt = Date.now()
          batch.completedTiles++

          options?.onProgress?.(batch.completedTiles, batch.totalTiles)
          this.notifyListeners()

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'

          const retries = this.retryCount.get(job.id) || 0
          if (retries < this.maxRetries) {
            this.retryCount.set(job.id, retries + 1)
            nextIndex--
            await new Promise(resolve => setTimeout(resolve, this.retryDelayMs))
            continue
          }

          job.status = 'failed'
          job.error = errorMsg
          job.completedAt = Date.now()
          batch.failedTiles++

          this.notifyListeners()
        }
      }
    }

    batch.status = 'in_progress'
    this.notifyListeners()

    const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, () => processNext())
    await Promise.all(workers)

    batch.completedAt = Date.now()
    if (batch.completedTiles === batch.totalTiles) {
      batch.status = 'completed'
    } else if (batch.completedTiles > 0) {
      batch.status = 'partial'
    } else {
      batch.status = 'failed'
    }

    this.currentBatch = null
    this.notifyListeners()

    return batch
  }

  // ============================================
  // VISIBLE TILES ENHANCEMENT
  // ============================================

  async enhanceVisibleTiles(
    tiles: Array<{ z: number; x: number; y: number; url: string }>
  ): Promise<void> {
    const enhancer = getTileEnhancer()
    await enhancer.enhanceVisibleTiles(tiles)
  }

  // ============================================
  // PREFETCH
  // ============================================

  async prefetchArea(
    centerZ: number,
    centerX: number,
    centerY: number,
    radius: number = 2
  ): Promise<void> {
    const enhancer = getTileEnhancer()
    await enhancer.prefetchTiles(centerZ, centerX, centerY, radius)
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  setQuality(quality: AIQualityLevel) {
    getTileEnhancer().setAIQuality(quality)
    this.notifyListeners()
  }

  setMode(mode: AIEnhancementMode) {
    getTileEnhancer().setAIMode(mode)
    this.notifyListeners()
  }

  setRegion(region: string) {
    getTileEnhancer().setRegion(region)
    this.notifyListeners()
  }

  setEnabled(enabled: boolean) {
    getTileEnhancer().setAIEnabled(enabled)
    this.notifyListeners()
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  async clearCache(): Promise<void> {
    await getTileEnhancer().clearCache()
    this.jobHistory.clear()
    this.retryCount.clear()
    this.notifyListeners()
  }

  // ============================================
  // CLEANUP
  // ============================================

  destroy() {
    this.stopStatusPolling()
    this.listeners.clear()
    this.currentBatch = null
    this.jobHistory.clear()
    this.retryCount.clear()
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const aiTileGenerationService = new AITileGenerationServiceImpl()

export default aiTileGenerationService
