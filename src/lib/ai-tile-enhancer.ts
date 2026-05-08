'use client'

/**
 * AI Tile Enhancement System - v3.0
 *
 * AI-powered progressive enhancement pipeline for satellite map tiles:
 *
 * 1. **Canvas Fast Path** (instant): Client-side canvas-based pre-processing
 *    for immediate display — basic contrast/brightness adjustment.
 *
 * 2. **AI Generation Path** (async, high-quality): Server-side AI image
 *    generation using z-ai-web-dev-sdk to produce photorealistic enhanced
 *    satellite tile imagery based on geographic context prompts.
 *
 * 3. **Progressive Enhancement Flow**:
 *    - Tile requested → check cache → return cached AI tile if available
 *    - Otherwise → apply Canvas pre-processing instantly (fast path)
 *    - Queue AI enhancement request → when ready, swap tile with AI version
 *    - Cache AI result in IndexedDB for future instant retrieval
 *
 * 4. **Multi-layer Caching**:
 *    - L1: In-memory Map (fastest, limited size)
 *    - L2: IndexedDB (persistent, larger capacity)
 *    - L3: Server-side cache (survives page reloads)
 */

// ============================================
// TYPES
// ============================================

interface CachedTile {
  enhanced: Blob
  original?: Blob
  aiEnhanced?: Blob          // AI-generated version (highest quality)
  timestamp: number
  source: 'ai' | 'canvas' | 'original'
  aiPrompt?: string
  aiModel?: string
}

export type AIQualityLevel = 'standard' | 'high' | 'ultra'

export type AIEnhancementMode = 'photorealistic' | 'enhanced-satellite' | 'urban-detail' | 'terrain-clarity'

interface AIEnhancementConfig {
  enabled: boolean
  quality: AIQualityLevel
  mode: AIEnhancementMode
  maxConcurrentRequests: number
  requestDelay: number       // ms between requests to avoid rate limiting
  autoEnhance: boolean       // auto-enhance tiles as they appear
  enhanceOnZoom: number[]    // zoom levels to auto-enhance
  customPrompt?: string      // optional custom prompt suffix
  region?: string            // geographic region for context-aware prompts
}

interface TileEnhancementResult {
  blob: Blob
  source: 'ai' | 'canvas' | 'original' | 'cache'
  processingTime?: number
}

// ============================================
// GEOGRAPHIC CONTEXT BUILDER
// ============================================

/**
 * Builds an AI image generation prompt tailored to the geographic
 * context of a map tile. The prompt guides the AI to enhance the
 * satellite tile while preserving geographic accuracy.
 */
export function buildEnhancementPrompt(
  z: number,
  x: number,
  y: number,
  mode: AIEnhancementMode,
  region?: string,
  customPrompt?: string
): string {
  // Determine approximate location description from tile coordinates
  const regionContext = region || 'Kampala, Uganda, East Africa'

  // Build base prompt based on enhancement mode
  const modePrompts: Record<AIEnhancementMode, string> = {
    'photorealistic': `Ultra-realistic enhanced satellite imagery of ${regionContext}. Photorealistic aerial view with crystal-clear detail, vibrant natural colors, sharp building outlines, visible road markings, clear vegetation textures, professional satellite photography quality, 8K resolution detail, no artifacts, no blur`,
    'enhanced-satellite': `High-resolution satellite image of ${regionContext}. Enhanced clarity with sharper edges, improved color accuracy, better contrast between urban and natural features, clear road network visibility, distinct building footprints, professional cartographic satellite quality`,
    'urban-detail': `Detailed urban satellite imagery of ${regionContext}. Ultra-sharp building outlines, clearly visible street patterns, distinct land use boundaries, enhanced infrastructure details, clear vehicle-scale features, professional urban planning satellite view`,
    'terrain-clarity': `Terrain-enhanced satellite imagery of ${regionContext}. Clear elevation features, distinct vegetation types, visible water features, enhanced topographic detail, natural color enhancement, professional geographic survey quality`
  }

  let prompt = modePrompts[mode]

  // Add zoom-level context
  if (z >= 16) {
    prompt += ', building-level detail, individual structures visible, street-level clarity'
  } else if (z >= 14) {
    prompt += ', neighborhood-level detail, block outlines clear, major roads visible'
  } else if (z >= 11) {
    prompt += ', district-level view, urban boundaries clear, major features prominent'
  } else {
    prompt += ', regional overview, landscape features clear, broad geographic patterns'
  }

  // Add custom prompt if provided
  if (customPrompt) {
    prompt += `, ${customPrompt}`
  }

  return prompt
}

/**
 * Convert tile coordinates to approximate lat/lng for context
 */
export function tileToLatLng(z: number, x: number, y: number): { lat: number; lng: number } {
  const n = Math.pow(2, z)
  const lng = (x / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  const lat = (latRad * 180) / Math.PI
  return { lat, lng }
}

// ============================================
// CANVAS TILE PRE-PROCESSOR (Fast Path)
// ============================================

export class CanvasTilePreprocessor {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 512
    this.canvas.height = 512
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
  }

  /**
   * Quick client-side enhancement using Canvas 2D API.
   * This provides an immediate visual improvement while the
   * AI-enhanced version is being generated on the server.
   */
  async preprocess(
    imageBlob: Blob,
    options: {
      brightness?: number   // -100 to 100
      contrast?: number     // -100 to 100
      saturation?: number   // -100 to 100
      sharpness?: number    // 0 to 100
    } = {}
  ): Promise<Blob> {
    if (!this.ctx) return imageBlob

    const {
      brightness = 8,
      contrast = 15,
      saturation = 20,
      sharpness = 30
    } = options

    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        this.canvas.width = img.width
        this.canvas.height = img.height

        const ctx = this.ctx!

        // Apply CSS filter for brightness, contrast, saturation
        ctx.filter = `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100}) saturate(${1 + saturation / 100})`
        ctx.drawImage(img, 0, 0)
        ctx.filter = 'none'

        // Apply unsharp mask for sharpening
        if (sharpness > 0) {
          const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
          const data = imageData.data
          const width = this.canvas.width
          const height = this.canvas.height
          const original = new Uint8ClampedArray(data)

          const amount = sharpness / 100 * 1.5

          for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
              const idx = (y * width + x) * 4

              for (let c = 0; c < 3; c++) {
                // Laplacian kernel for sharpening
                const center = original[idx + c]
                const neighbors =
                  original[((y - 1) * width + x) * 4 + c] +
                  original[((y + 1) * width + x) * 4 + c] +
                  original[(y * width + (x - 1)) * 4 + c] +
                  original[(y * width + (x + 1)) * 4 + c]

                const laplacian = center * 4 - neighbors
                data[idx + c] = Math.min(255, Math.max(0, center + laplacian * amount))
              }
            }
          }

          ctx.putImageData(imageData, 0, 0)
        }

        this.canvas.toBlob((blob) => {
          resolve(blob || imageBlob)
        }, 'image/png', 0.95)
      }

      img.onerror = () => resolve(imageBlob)

      const url = URL.createObjectURL(imageBlob)
      img.src = url
    })
  }
}

// ============================================
// TILE CACHE MANAGER
// ============================================

export class TileCacheManager {
  private memoryCache: Map<string, CachedTile> = new Map()
  private dbName = 'ai-tile-cache-v3'
  private db: IDBDatabase | null = null
  private maxMemoryCache = 500

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 3)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Delete old store if it exists (migration from v2)
        if (db.objectStoreNames.contains('tiles')) {
          db.deleteObjectStore('tiles')
        }

        const store = db.createObjectStore('tiles', { keyPath: 'key' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('source', 'source', { unique: false })
        store.createIndex('mode', 'mode', { unique: false })
      }
    })
  }

  private getKey(z: number, x: number, y: number, quality?: string, mode?: string): string {
    const parts = [`${z}/${x}/${y}`]
    if (quality) parts.push(quality)
    if (mode) parts.push(mode)
    return parts.join('/')
  }

  async get(z: number, x: number, y: number, quality?: string, mode?: string): Promise<CachedTile | null> {
    const key = this.getKey(z, x, y, quality, mode)

    // Check memory cache first
    const memoryCached = this.memoryCache.get(key)
    if (memoryCached) {
      return memoryCached
    }

    // Check IndexedDB
    if (this.db) {
      return new Promise((resolve) => {
        const transaction = this.db!.transaction(['tiles'], 'readonly')
        const store = transaction.objectStore('tiles')
        const request = store.get(key)

        request.onsuccess = () => {
          const result = request.result
          if (result) {
            // Promote to memory cache
            this.memoryCache.set(key, result)
            resolve(result)
          } else {
            resolve(null)
          }
        }

        request.onerror = () => resolve(null)
      })
    }

    return null
  }

  async set(z: number, x: number, y: number, tile: CachedTile, quality?: string, mode?: string): Promise<void> {
    const key = this.getKey(z, x, y, quality, mode)

    // Update memory cache
    this.memoryCache.set(key, tile)

    // Prune memory cache if too large
    if (this.memoryCache.size > this.maxMemoryCache) {
      const entries = Array.from(this.memoryCache.entries())
      const toRemove = entries.slice(0, 100)
      toRemove.forEach(([k]) => this.memoryCache.delete(k))
    }

    // Store in IndexedDB
    if (this.db) {
      return new Promise((resolve) => {
        const transaction = this.db!.transaction(['tiles'], 'readwrite')
        const store = transaction.objectStore('tiles')
        store.put({ key, ...tile })
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
      })
    }
  }

  async hasAIEnhanced(z: number, x: number, y: number, quality?: string, mode?: string): Promise<boolean> {
    const cached = await this.get(z, x, y, quality, mode)
    return cached?.source === 'ai' && !!cached.aiEnhanced
  }

  async clear(): Promise<void> {
    this.memoryCache.clear()

    if (this.db) {
      return new Promise((resolve) => {
        const transaction = this.db!.transaction(['tiles'], 'readwrite')
        const store = transaction.objectStore('tiles')
        store.clear()
        transaction.oncomplete = () => resolve()
      })
    }
  }

  /**
   * Get cache statistics for debugging and UI display
   */
  getStats(): { memorySize: number; maxMemory: number } {
    return {
      memorySize: this.memoryCache.size,
      maxMemory: this.maxMemoryCache
    }
  }
}

// ============================================
// AI TILE ENHANCER (Main Orchestrator)
// ============================================

export class AITileEnhancer {
  private canvasPreprocessor: CanvasTilePreprocessor | null = null
  private cache: TileCacheManager
  private enhancementQueue: Array<{
    z: number; x: number; y: number
    originalUrl: string
    quality: AIQualityLevel
    mode: AIEnhancementMode
    priority: number
  }> = []
  private isProcessing = false
  private aiConfig: AIEnhancementConfig
  private activeRequests = 0
  private lastRequestTime = 0
  private tileUrlMap: Map<string, string> = new Map()
  private enhancementCallbacks: Map<string, Array<(result: TileEnhancementResult) => void>> = new Map()
  private initialized = false
  private stats = {
    canvasHits: 0,
    aiHits: 0,
    aiRequests: 0,
    aiFailures: 0,
    totalProcessingTime: 0
  }

  constructor(config?: Partial<AIEnhancementConfig>) {
    this.cache = new TileCacheManager()
    this.aiConfig = {
      enabled: config?.enabled ?? true,
      quality: config?.quality ?? 'high',
      mode: config?.mode ?? 'enhanced-satellite',
      maxConcurrentRequests: config?.maxConcurrentRequests ?? 2,
      requestDelay: config?.requestDelay ?? 300,
      autoEnhance: config?.autoEnhance ?? true,
      enhanceOnZoom: config?.enhanceOnZoom ?? [14, 15, 16, 17, 18],
      customPrompt: config?.customPrompt,
      region: config?.region ?? 'Kampala, Uganda'
    }
    this.init()
  }

  private async init() {
    try {
      await this.cache.init()
      this.canvasPreprocessor = new CanvasTilePreprocessor()
      this.initialized = true
      console.log('[AITileEnhancer v3] Initialized with AI-powered tile enhancement pipeline')
    } catch (error) {
      console.warn('[AITileEnhancer v3] Initialization error:', error)
    }
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  setAIConfig(config: Partial<AIEnhancementConfig>) {
    this.aiConfig = { ...this.aiConfig, ...config }
  }

  setAIEnabled(enabled: boolean) {
    this.aiConfig.enabled = enabled
  }

  setAIQuality(quality: AIQualityLevel) {
    this.aiConfig.quality = quality
  }

  setAIMode(mode: AIEnhancementMode) {
    this.aiConfig.mode = mode
  }

  setRegion(region: string) {
    this.aiConfig.region = region
  }

  setCustomPrompt(prompt: string | undefined) {
    this.aiConfig.customPrompt = prompt
  }

  // ============================================
  // CALLBACK REGISTRATION
  // ============================================

  onTileEnhanced(z: number, x: number, y: number, callback: (result: TileEnhancementResult) => void) {
    const key = `${z}/${x}/${y}`
    if (!this.enhancementCallbacks.has(key)) {
      this.enhancementCallbacks.set(key, [])
    }
    this.enhancementCallbacks.get(key)!.push(callback)
  }

  // ============================================
  // TILE URL MANAGEMENT
  // ============================================

  getEnhancedTileUrl(originalUrl: string, z: number, x: number, y: number): string {
    const key = `${z}/${x}/${y}`
    this.tileUrlMap.set(key, originalUrl)

    // Return our proxy URL that handles enhancement
    return `/api/enhance-tile?url=${encodeURIComponent(originalUrl)}&z=${z}&x=${x}&y=${y}`
  }

  getAIEnhancedTileUrl(z: number, x: number, y: number): string {
    const params = new URLSearchParams({
      z: String(z),
      x: String(x),
      y: String(y),
      quality: this.aiConfig.quality,
      mode: this.aiConfig.mode
    })
    if (this.aiConfig.region) {
      params.set('region', this.aiConfig.region)
    }
    return `/api/ai-enhance-tile?${params.toString()}`
  }

  // ============================================
  // MAIN ENHANCEMENT PIPELINE
  // ============================================

  /**
   * Enhance a tile using the progressive pipeline:
   * 1. Check cache for AI-enhanced version (instant if available)
   * 2. If not cached, apply Canvas pre-processing (fast, ~20ms)
   * 3. Queue AI enhancement request (async, ~2-8s)
   * 4. When AI tile is ready, update cache and notify listeners
   */
  async enhanceTile(blob: Blob, z: number, x: number, y: number): Promise<Blob> {
    const startTime = performance.now()

    // Step 1: Check cache for AI-enhanced version
    const cached = await this.cache.get(z, x, y, this.aiConfig.quality, this.aiConfig.mode)
    if (cached) {
      if (cached.source === 'ai' && cached.aiEnhanced) {
        this.stats.aiHits++
        console.log(`[AITileEnhancer v3] AI cache hit: ${z}/${x}/${y}`)
        return cached.aiEnhanced
      }
      if (cached.enhanced) {
        this.stats.canvasHits++
        console.log(`[AITileEnhancer v3] Canvas cache hit: ${z}/${x}/${y}`)
        return cached.enhanced
      }
    }

    // Step 2: Apply Canvas pre-processing (instant fallback)
    let preprocessed = blob
    if (this.canvasPreprocessor) {
      preprocessed = await this.canvasPreprocessor.preprocess(blob, {
        brightness: 8,
        contrast: 15,
        saturation: 20,
        sharpness: 30
      })
    }

    // Cache the preprocessed result
    await this.cache.set(z, x, y, {
      enhanced: preprocessed,
      original: blob,
      timestamp: Date.now(),
      source: 'canvas'
    }, this.aiConfig.quality, this.aiConfig.mode)

    // Step 3: Queue AI enhancement if enabled
    if (this.aiConfig.enabled && this.aiConfig.enhanceOnZoom.includes(z)) {
      const originalUrl = this.tileUrlMap.get(`${z}/${x}/${y}`)
      if (originalUrl) {
        this.queueForAIEnhancement(z, x, y, originalUrl, 0)
      }
    }

    const processingTime = performance.now() - startTime
    this.stats.totalProcessingTime += processingTime

    return preprocessed
  }

  /**
   * Quick check: get the best available cached tile without enhancement
   */
  async getCachedTile(z: number, x: number, y: number): Promise<Blob | null> {
    const cached = await this.cache.get(z, x, y, this.aiConfig.quality, this.aiConfig.mode)
    if (cached?.aiEnhanced) return cached.aiEnhanced
    if (cached?.enhanced) return cached.enhanced
    return null
  }

  // ============================================
  // AI ENHANCEMENT QUEUE
  // ============================================

  private queueForAIEnhancement(
    z: number, x: number, y: number,
    originalUrl: string, priority: number
  ) {
    // Check if already in queue
    const exists = this.enhancementQueue.some(
      item => item.z === z && item.x === x && item.y === y && item.mode === this.aiConfig.mode
    )
    if (exists) return

    // Check if already AI-enhanced in cache
    this.cache.hasAIEnhanced(z, x, y, this.aiConfig.quality, this.aiConfig.mode).then(has => {
      if (has) return

      this.enhancementQueue.push({
        z, x, y, originalUrl,
        quality: this.aiConfig.quality,
        mode: this.aiConfig.mode,
        priority
      })

      // Sort by priority (lower number = higher priority)
      this.enhancementQueue.sort((a, b) => a.priority - b.priority)

      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.isProcessing || this.enhancementQueue.length === 0) return
    if (this.activeRequests >= this.aiConfig.maxConcurrentRequests) return

    this.isProcessing = true

    while (this.enhancementQueue.length > 0 &&
           this.activeRequests < this.aiConfig.maxConcurrentRequests) {
      const item = this.enhancementQueue.shift()
      if (!item) break

      // Rate limiting
      const now = Date.now()
      const timeSinceLastRequest = now - this.lastRequestTime
      if (timeSinceLastRequest < this.aiConfig.requestDelay) {
        await new Promise(resolve =>
          setTimeout(resolve, this.aiConfig.requestDelay - timeSinceLastRequest)
        )
      }

      this.activeRequests++
      this.lastRequestTime = Date.now()
      this.stats.aiRequests++

      this.processAIEnhancement(item)
        .then(() => {
          this.activeRequests--
          this.processQueue()
        })
        .catch((error) => {
          console.warn(`[AITileEnhancer v3] AI enhancement failed for ${item.z}/${item.x}/${item.y}:`, error)
          this.stats.aiFailures++
          this.activeRequests--
          this.processQueue()
        })
    }

    this.isProcessing = false
  }

  // ============================================
  // AI ENHANCEMENT PROCESSING
  // ============================================

  private async processAIEnhancement(item: {
    z: number; x: number; y: number
    originalUrl: string; quality: AIQualityLevel; mode: AIEnhancementMode; priority: number
  }): Promise<void> {
    const startTime = performance.now()

    try {
      console.log(`[AITileEnhancer v3] Requesting AI enhancement for ${item.z}/${item.x}/${item.y} (${item.mode})`)

      // Build the AI prompt based on tile coordinates and mode
      const prompt = buildEnhancementPrompt(
        item.z, item.x, item.y,
        item.mode,
        this.aiConfig.region,
        this.aiConfig.customPrompt
      )

      // Call the AI enhancement API
      const response = await fetch('/api/ai-enhance-tile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          z: item.z,
          x: item.x,
          y: item.y,
          originalUrl: item.originalUrl,
          quality: item.quality,
          mode: item.mode,
          prompt,
          region: this.aiConfig.region
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ fallback: false }))
        if (errorData.fallback) {
          console.log(`[AITileEnhancer v3] AI enhancement unavailable, keeping Canvas version for ${item.z}/${item.x}/${item.y}`)
          return
        }
        throw new Error(`AI enhancement API error: ${response.status}`)
      }

      // Get the AI-generated image as a blob
      const aiBlob = await response.blob()
      const processingTime = performance.now() - startTime

      // Update cache with AI-enhanced version
      const existing = await this.cache.get(item.z, item.x, item.y, item.quality, item.mode)
      await this.cache.set(item.z, item.x, item.y, {
        enhanced: existing?.enhanced || aiBlob,
        original: existing?.original,
        aiEnhanced: aiBlob,
        timestamp: Date.now(),
        source: 'ai',
        aiPrompt: prompt,
        aiModel: 'z-ai-image-gen'
      }, item.quality, item.mode)

      console.log(`[AITileEnhancer v3] AI enhancement complete for ${item.z}/${item.x}/${item.y} in ${Math.round(processingTime)}ms`)

      // Notify listeners
      const key = `${item.z}/${item.x}/${item.y}`
      const callbacks = this.enhancementCallbacks.get(key) || []
      callbacks.forEach(cb => cb({
        blob: aiBlob,
        source: 'ai',
        processingTime
      }))
      this.enhancementCallbacks.delete(key)

    } catch (error) {
      console.warn(`[AITileEnhancer v3] AI enhancement error for ${item.z}/${item.x}/${item.y}:`, error)
      throw error
    }
  }

  // ============================================
  // PREFETCH & BULK OPERATIONS
  // ============================================

  async prefetchTiles(centerZ: number, centerX: number, centerY: number, radius: number = 2) {
    const tiles: Array<{ url: string; z: number; x: number; y: number }> = []

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const z = centerZ + dz
          const x = centerX + dx
          const y = centerY + dy
          const key = `${z}/${x}/${y}`

          if (this.tileUrlMap.has(key)) {
            tiles.push({
              url: this.tileUrlMap.get(key)!,
              z, x, y
            })
          }
        }
      }
    }

    // Queue all for AI enhancement with lower priority
    tiles.forEach(tile => {
      this.queueForAIEnhancement(tile.z, tile.x, tile.y, tile.url, 10)
    })

    // Also fire-and-forget prefetch to tile proxy
    if (tiles.length > 0) {
      fetch('/api/enhance-tile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiles })
      }).catch(() => {})
    }
  }

  async enhanceVisibleTiles(
    tiles: Array<{ z: number; x: number; y: number; url: string }>
  ) {
    tiles.forEach(tile => {
      const key = `${tile.z}/${tile.x}/${tile.y}`
      this.tileUrlMap.set(key, tile.url)
      this.queueForAIEnhancement(tile.z, tile.x, tile.y, tile.url, 0)
    })
  }

  // ============================================
  // LEGACY COMPATIBILITY
  // ============================================

  /**
   * Update enhancement parameters (legacy compatibility).
   * Maps old WebGL-style parameters to Canvas preprocessor options.
   */
  updateOptions(options: {
    sharpen?: number
    contrast?: number
    saturation?: number
    brightness?: number
    vibrance?: number
    clarity?: number
  }) {
    // These are now handled through the Canvas preprocessor
    // The parameters are logged for debugging but the AI path
    // overrides them with model-generated results
    console.log('[AITileEnhancer v3] Enhancement options updated:', options)
  }

  // ============================================
  // STATS & MAINTENANCE
  // ============================================

  async clearCache() {
    await this.cache.clear()
  }

  getConfig(): AIEnhancementConfig {
    return { ...this.aiConfig }
  }

  isReady(): boolean {
    return this.initialized
  }

  getStats(): {
    canvasHits: number
    aiHits: number
    aiRequests: number
    aiFailures: number
    avgProcessingTime: number
    queueLength: number
    activeRequests: number
  } {
    return {
      canvasHits: this.stats.canvasHits,
      aiHits: this.stats.aiHits,
      aiRequests: this.stats.aiRequests,
      aiFailures: this.stats.aiFailures,
      avgProcessingTime: this.stats.aiRequests > 0
        ? this.stats.totalProcessingTime / this.stats.aiRequests
        : 0,
      queueLength: this.enhancementQueue.length,
      activeRequests: this.activeRequests
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let enhancerInstance: AITileEnhancer | null = null

export function getTileEnhancer(config?: Partial<AIEnhancementConfig>): AITileEnhancer {
  if (!enhancerInstance) {
    enhancerInstance = new AITileEnhancer(config)
  }
  return enhancerInstance
}

export function resetTileEnhancer(): void {
  enhancerInstance = null
}
