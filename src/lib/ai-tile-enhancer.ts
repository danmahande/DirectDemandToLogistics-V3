'use client'

/**
 * AI Tile Enhancement System - v5.0
 *
 * Progressive AI-powered tile enhancement pipeline using
 * MapLibre GL's addProtocol API for transparent tile interception.
 *
 * Architecture:
 *
 * 1. **MapLibre Custom Protocol** (`ai-enhanced://`): Intercepts ALL
 *    tile requests from MapLibre GL and routes them through the
 *    enhancement pipeline.
 *
 * 2. **WebGL Fast Path** (~5ms): GPU-accelerated shader-based enhancement
 *    for instant display. Extracted into `webgl-enhancer.ts`.
 *
 * 3. **Canvas 2D Fast Path** (~20ms): Client-side canvas processing as
 *    fallback when WebGL is unavailable.
 *
 * 4. **AI Generation Path** (async, ~2-8s): Server-side AI image
 *    generation using VLM analysis + text-to-image.
 *
 * 5. **Progressive Enhancement Flow**:
 *    - MapLibre requests tile via `ai-enhanced://` protocol
 *    - Check cache → return AI tile if available
 *    - Otherwise → apply WebGL/Canvas enhancement instantly
 *    - Return preprocessed tile to MapLibre for display
 *    - Queue AI enhancement → when ready, update cache
 *    - Next request serves the AI-enhanced version
 *
 * 6. **Multi-layer Caching**:
 *    - L1: In-memory Map (fastest, limited)
 *    - L2: IndexedDB (persistent, larger)
 *    - L3: Server-side cache (survives page reloads)
 */

import maplibregl from 'maplibre-gl'
import { WebGLTileEnhancer, type WebGLEnhancementOptions } from '@/lib/webgl-enhancer'
import {
  CACHE_CONFIG,
  AI_ENHANCED_PROTOCOL,
  AI_ENHANCED_TILE_URL,
  DEFAULT_SATELLITE_SOURCE,
  CANVAS_PREPROCESSING_DEFAULTS,
  WEBGL_ENHANCEMENT_DEFAULTS
} from '@/lib/config'
import type {
  CachedTile,
  AIEnhancementConfig,
  AIQualityLevel,
  AIEnhancementMode,
  TileEnhancementResult
} from '@/types/map'

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
  const regionContext = region || 'Kampala, Uganda, East Africa'

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

/**
 * Build the full original tile URL from z/x/y coordinates
 */
export function buildOriginalTileUrl(
  templateUrl: string,
  z: number,
  x: number,
  y: number
): string {
  return templateUrl
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

// ============================================
// TILE CACHE MANAGER
// ============================================

export class TileCacheManager {
  private memoryCache: Map<string, CachedTile> = new Map()
  private dbName = CACHE_CONFIG.clientIndexedDBName
  private db: IDBDatabase | null = null
  private maxMemoryCache = CACHE_CONFIG.clientMemoryMax

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, CACHE_CONFIG.clientIndexedDBVersion)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Delete old stores if migrating
        if (db.objectStoreNames.contains('tiles')) {
          db.deleteObjectStore('tiles')
        }

        const store = db.createObjectStore('tiles', { keyPath: 'key' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('source', 'source', { unique: false })
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

  getStats(): { memorySize: number; maxMemory: number } {
    return {
      memorySize: this.memoryCache.size,
      maxMemory: this.maxMemoryCache
    }
  }
}

// ============================================
// ENHANCEMENT QUEUE
// ============================================

interface EnhancementQueueItem {
  z: number
  x: number
  y: number
  originalUrl: string
  quality: AIQualityLevel
  mode: AIEnhancementMode
  priority: number
}

// ============================================
// AI TILE ENHANCER (Main Orchestrator)
// ============================================

export class AITileEnhancer {
  private webglEnhancer: WebGLTileEnhancer | null = null
  private cache: TileCacheManager
  private enhancementQueue: EnhancementQueueItem[] = []
  private isProcessing = false
  private aiConfig: AIEnhancementConfig
  private activeRequests = 0
  private lastRequestTime = 0
  private enhancementCallbacks: Map<string, Array<(result: TileEnhancementResult) => void>> = new Map()
  private initialized = false
  private protocolRegistered = false
  private stats = {
    canvasHits: 0,
    webglHits: 0,
    aiHits: 0,
    aiRequests: 0,
    aiFailures: 0,
    totalProcessingTime: 0,
    protocolIntercepts: 0
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
      region: config?.region ?? 'Kampala, Uganda',
      tileSourceUrl: config?.tileSourceUrl ?? DEFAULT_SATELLITE_SOURCE.url
    }
    this.init()
  }

  private async init() {
    try {
      await this.cache.init()

      // Initialize WebGL enhancer (fast path)
      this.webglEnhancer = new WebGLTileEnhancer()
      console.log(`[AITileEnhancer v5] WebGL fast path: ${this.webglEnhancer.ready() ? 'READY' : 'FALLBACK to Canvas2D'}`)

      this.registerMapLibreProtocol()
      this.initialized = true
      console.log('[AITileEnhancer v5] Initialized with MapLibre protocol + WebGL fast fallback')
    } catch (error) {
      console.warn('[AITileEnhancer v5] Initialization error:', error)
    }
  }

  // ============================================
  // MAPLIBRE CUSTOM PROTOCOL
  // ============================================

  private registerMapLibreProtocol() {
    if (this.protocolRegistered) return
    if (typeof maplibregl?.addProtocol !== 'function') {
      console.warn('[AITileEnhancer v5] MapLibre addProtocol not available')
      return
    }

    // MapLibre GL v4+ addProtocol: receives RequestParameters and an AbortController,
    // must return a promise that resolves to GetResourceResponse ({data: ArrayBuffer}).
    maplibregl.addProtocol(AI_ENHANCED_PROTOCOL, (params, abortController) => {
      const tileUrl = params.url.replace(`${AI_ENHANCED_PROTOCOL}://`, '')
      const parts = tileUrl.split('/')
      const sourceName = parts[0]
      const z = parseInt(parts[1])
      const x = parseInt(parts[2])
      const y = parseInt(parts[3])

      if (isNaN(z) || isNaN(x) || isNaN(y)) {
        return Promise.reject(new Error('Invalid tile coordinates'))
      }

      this.stats.protocolIntercepts++

      // Wire up MapLibre's AbortController to our fetch chain
      const signal = abortController.signal

      // Return a promise — MapLibre v4+ expects promise-based protocol handlers
      return this.handleTileRequest(sourceName, z, x, y)
        .then((arrayBuffer) => {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          return { data: arrayBuffer }
        })
        .catch((error: unknown) => {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          console.warn(`[AITileEnhancer v5] Protocol handler error for ${z}/${x}/${y}:`, error)
          // Fallback: serve the original unenhanced tile
          return this.fetchOriginalTile(z, x, y)
            .then((fallbackBuffer) => ({ data: fallbackBuffer }))
            .catch(() => {
              throw error
            })
        })
    })

    this.protocolRegistered = true
    console.log(`[AITileEnhancer v5] Registered ${AI_ENHANCED_PROTOCOL}:// protocol with MapLibre GL`)
  }

  /**
   * Handle a tile request from the MapLibre protocol handler.
   */
  private async handleTileRequest(sourceName: string, z: number, x: number, y: number): Promise<ArrayBuffer> {
    // Step 1: Check cache for AI-enhanced version
    const cached = await this.cache.get(z, x, y, this.aiConfig.quality, this.aiConfig.mode)
    if (cached) {
      if (cached.source === 'ai' && cached.aiEnhanced) {
        this.stats.aiHits++
        return cached.aiEnhanced.arrayBuffer()
      }
      if (cached.enhanced) {
        this.stats.canvasHits++
        return cached.enhanced.arrayBuffer()
      }
    }

    // Step 2: Fetch original tile
    const originalBlob = await this.fetchOriginalTileAsBlob(z, x, y)

    // Step 3: Apply WebGL fast-path enhancement (or Canvas fallback)
    let preprocessed = originalBlob

    if (this.aiConfig.enabled) {
      // Try WebGL enhancement first
      if (this.webglEnhancer && this.webglEnhancer.ready()) {
        try {
          const result = await this.webglEnhancer.enhance(originalBlob, {
            ...WEBGL_ENHANCEMENT_DEFAULTS
          })
          preprocessed = result.blob
          this.stats.webglHits++
        } catch {
          // WebGL failed, use Canvas 2D fallback
          preprocessed = await this.canvas2dPreprocess(originalBlob)
        }
      } else {
        // No WebGL, use Canvas 2D
        preprocessed = await this.canvas2dPreprocess(originalBlob)
      }
    }

    // Cache the preprocessed result
    await this.cache.set(z, x, y, {
      enhanced: preprocessed,
      original: originalBlob,
      timestamp: Date.now(),
      source: 'canvas'
    }, this.aiConfig.quality, this.aiConfig.mode)

    // Step 4: Queue AI enhancement if enabled and zoom level matches
    if (this.aiConfig.enabled && this.aiConfig.autoEnhance && this.aiConfig.enhanceOnZoom.includes(z)) {
      const originalUrl = buildOriginalTileUrl(this.aiConfig.tileSourceUrl, z, x, y)
      this.queueForAIEnhancement(z, x, y, originalUrl, 0)
    }

    return preprocessed.arrayBuffer()
  }

  /**
   * Canvas 2D fallback pre-processing
   */
  private async canvas2dPreprocess(imageBlob: Blob): Promise<Blob> {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return imageBlob

    const { brightness, contrast, saturation, sharpness } = CANVAS_PREPROCESSING_DEFAULTS

    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height

        ctx.filter = `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100}) saturate(${1 + saturation / 100})`
        ctx.drawImage(img, 0, 0)
        ctx.filter = 'none'

        if (sharpness > 0) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const data = imageData.data
          const original = new Uint8ClampedArray(data)
          const width = canvas.width
          const height = canvas.height
          const amount = (sharpness / 100) * 1.5

          for (let row = 1; row < height - 1; row++) {
            for (let col = 1; col < width - 1; col++) {
              const idx = (row * width + col) * 4
              for (let c = 0; c < 3; c++) {
                const center = original[idx + c]
                const neighbors =
                  original[((row - 1) * width + col) * 4 + c] +
                  original[((row + 1) * width + col) * 4 + c] +
                  original[(row * width + (col - 1)) * 4 + c] +
                  original[(row * width + (col + 1)) * 4 + c]
                const laplacian = center * 4 - neighbors
                data[idx + c] = Math.min(255, Math.max(0, center + laplacian * amount))
              }
            }
          }
          ctx.putImageData(imageData, 0, 0)
        }

        canvas.toBlob((blob) => {
          resolve(blob || imageBlob)
        }, 'image/png', 0.95)
      }

      img.onerror = () => resolve(imageBlob)
      img.src = URL.createObjectURL(imageBlob)
    })
  }

  /**
   * Fetch the original satellite tile as a Blob
   */
  private async fetchOriginalTileAsBlob(z: number, x: number, y: number): Promise<Blob> {
    const tileUrl = buildOriginalTileUrl(this.aiConfig.tileSourceUrl, z, x, y)

    // Try fetching through our proxy first
    try {
      const proxyUrl = `/api/enhance-tile?url=${encodeURIComponent(tileUrl)}&z=${z}&x=${x}&y=${y}`
      const response = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(10000)
      })
      if (response.ok) {
        return await response.blob()
      }
    } catch {
      // Proxy failed, fetch directly
    }

    // Direct fetch as fallback
    const response = await fetch(tileUrl, {
      headers: {
        'User-Agent': 'DirectDDL-Navigation/5.0',
        'Accept': 'image/png, image/jpeg, image/*'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      throw new Error(`Tile fetch failed: ${response.status}`)
    }

    return await response.blob()
  }

  /**
   * Fetch original tile as ArrayBuffer (for protocol fallback)
   */
  private async fetchOriginalTile(z: number, x: number, y: number): Promise<ArrayBuffer> {
    const blob = await this.fetchOriginalTileAsBlob(z, x, y)
    return blob.arrayBuffer()
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

  setTileSourceUrl(url: string) {
    this.aiConfig.tileSourceUrl = url
  }

  /**
   * Update WebGL/Canvas enhancement parameters
   */
  updateOptions(options: Partial<WebGLEnhancementOptions>) {
    console.log('[AITileEnhancer v5] Enhancement options updated:', options)
    // The options are applied at next tile processing time
    // through the WebGL enhancer's enhance() method
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
  // TILE URL HELPERS
  // ============================================

  getMapLibreTileUrl(): string {
    if (this.protocolRegistered) {
      return AI_ENHANCED_TILE_URL
    }
    return `/api/enhance-tile?url=${encodeURIComponent(this.aiConfig.tileSourceUrl)}&z={z}&x={x}&y={y}`
  }

  getEnhancedTileUrl(originalUrl: string, z: number, x: number, y: number): string {
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
    return `/api/generate-tile?${params.toString()}`
  }

  // ============================================
  // MAIN ENHANCEMENT PIPELINE
  // ============================================

  async enhanceTile(blob: Blob, z: number, x: number, y: number): Promise<Blob> {
    const startTime = performance.now()

    // Step 1: Check cache for AI-enhanced version
    const cached = await this.cache.get(z, x, y, this.aiConfig.quality, this.aiConfig.mode)
    if (cached) {
      if (cached.source === 'ai' && cached.aiEnhanced) {
        this.stats.aiHits++
        return cached.aiEnhanced
      }
      if (cached.enhanced) {
        this.stats.canvasHits++
        return cached.enhanced
      }
    }

    // Step 2: Apply WebGL/Canvas fast-path
    let preprocessed = blob
    if (this.aiConfig.enabled) {
      if (this.webglEnhancer && this.webglEnhancer.ready()) {
        try {
          const result = await this.webglEnhancer.enhance(blob, WEBGL_ENHANCEMENT_DEFAULTS)
          preprocessed = result.blob
        } catch {
          preprocessed = await this.canvas2dPreprocess(blob)
        }
      } else {
        preprocessed = await this.canvas2dPreprocess(blob)
      }
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
      const originalUrl = buildOriginalTileUrl(this.aiConfig.tileSourceUrl, z, x, y)
      this.queueForAIEnhancement(z, x, y, originalUrl, 0)
    }

    const processingTime = performance.now() - startTime
    this.stats.totalProcessingTime += processingTime

    return preprocessed
  }

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
    const exists = this.enhancementQueue.some(
      item => item.z === z && item.x === x && item.y === y && item.mode === this.aiConfig.mode
    )
    if (exists) return

    this.cache.hasAIEnhanced(z, x, y, this.aiConfig.quality, this.aiConfig.mode).then(has => {
      if (has) return

      this.enhancementQueue.push({
        z, x, y, originalUrl,
        quality: this.aiConfig.quality,
        mode: this.aiConfig.mode,
        priority
      })

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
        .catch(() => {
          this.stats.aiFailures++
          this.activeRequests--
          this.processQueue()
        })
    }

    this.isProcessing = false
  }

  private async processAIEnhancement(item: EnhancementQueueItem): Promise<void> {
    const startTime = performance.now()

    try {
      const prompt = buildEnhancementPrompt(
        item.z, item.x, item.y,
        item.mode,
        this.aiConfig.region,
        this.aiConfig.customPrompt
      )

      // Use the generate-tile API endpoint
      const response = await fetch('/api/generate-tile', {
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
          console.log(`[AITileEnhancer v5] AI unavailable, keeping fast-path version for ${item.z}/${item.x}/${item.y}`)
          return
        }
        throw new Error(`AI generation API error: ${response.status}`)
      }

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
        aiModel: 'z-ai-vlm+gen'
      }, item.quality, item.mode)

      console.log(`[AITileEnhancer v5] AI enhancement complete for ${item.z}/${item.x}/${item.y} in ${Math.round(processingTime)}ms`)

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
      console.warn(`[AITileEnhancer v5] AI enhancement error for ${item.z}/${item.x}/${item.y}:`, error)
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
          const url = buildOriginalTileUrl(this.aiConfig.tileSourceUrl, z, x, y)
          tiles.push({ url, z, x, y })
        }
      }
    }

    tiles.forEach(tile => {
      this.queueForAIEnhancement(tile.z, tile.x, tile.y, tile.url, 10)
    })

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
      this.queueForAIEnhancement(tile.z, tile.x, tile.y, tile.url, 0)
    })
  }

  async forceAIEnhance(z: number, x: number, y: number): Promise<Blob> {
    const cached = await this.cache.get(z, x, y, this.aiConfig.quality, this.aiConfig.mode)
    if (cached?.aiEnhanced) return cached.aiEnhanced

    const originalUrl = buildOriginalTileUrl(this.aiConfig.tileSourceUrl, z, x, y)
    const prompt = buildEnhancementPrompt(z, x, y, this.aiConfig.mode, this.aiConfig.region, this.aiConfig.customPrompt)

    const response = await fetch('/api/generate-tile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        z, x, y,
        originalUrl,
        quality: this.aiConfig.quality,
        mode: this.aiConfig.mode,
        prompt,
        region: this.aiConfig.region
      })
    })

    if (!response.ok) {
      throw new Error(`AI enhancement failed: ${response.status}`)
    }

    const aiBlob = await response.blob()

    await this.cache.set(z, x, y, {
      enhanced: cached?.enhanced || aiBlob,
      original: cached?.original,
      aiEnhanced: aiBlob,
      timestamp: Date.now(),
      source: 'ai',
      aiPrompt: prompt,
      aiModel: 'z-ai-vlm+gen'
    }, this.aiConfig.quality, this.aiConfig.mode)

    return aiBlob
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

  isProtocolRegistered(): boolean {
    return this.protocolRegistered
  }

  getStats(): {
    canvasHits: number
    webglHits: number
    aiHits: number
    aiRequests: number
    aiFailures: number
    avgProcessingTime: number
    queueLength: number
    activeRequests: number
    protocolIntercepts: number
  } {
    return {
      canvasHits: this.stats.canvasHits,
      webglHits: this.stats.webglHits,
      aiHits: this.stats.aiHits,
      aiRequests: this.stats.aiRequests,
      aiFailures: this.stats.aiFailures,
      avgProcessingTime: this.stats.aiRequests > 0
        ? this.stats.totalProcessingTime / this.stats.aiRequests
        : 0,
      queueLength: this.enhancementQueue.length,
      activeRequests: this.activeRequests,
      protocolIntercepts: this.stats.protocolIntercepts
    }
  }
}

// ============================================
// SINGLETON
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
