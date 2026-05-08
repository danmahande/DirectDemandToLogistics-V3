/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ZAI SDK Utility - v4.0
 *
 * Key improvements for local testing:
 * - API unreachable detection: if first call fails with network error,
 *   marks API as unreachable and immediately returns fallback for all
 *   subsequent requests (no more 30-60 second timeouts!)
 * - Short timeouts: 5s for API calls (not 30-60s)
 * - Proxy mode: ZAI_PROXY_URL forwards to deployed app
 * - Rate-limited queue with 429 retry + exponential backoff
 * - Image generation with URL→base64 conversion
 */

import ZAI from 'z-ai-web-dev-sdk'

// ============================================
// TYPES
// ============================================

interface ZAIConfig {
  baseUrl: string
  apiKey: string
  chatId?: string
  token?: string
  userId?: string
}

interface QueueItem {
  fn: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  retries: number
}

interface RateLimitInfo {
  qpsLimit: number
  dailyLimit: number
  tenMinLimit: number
  dailyRemaining: number
  tenMinRemaining: number
}

// ============================================
// CONFIGURATION
// ============================================

const API_TIMEOUT = 5000           // 5s timeout for connectivity checks
const API_TIMEOUT_IMAGE = 60000    // 60s for image gen (API can take 15-20s, plus URL fetch)
const HEALTH_TIMEOUT = 5000        // 5s for health check
const PROXY_TIMEOUT = 60000        // 60s for proxy (includes remote AI gen)
const MIN_REQUEST_INTERVAL = 600
const MAX_RETRIES = 2              // Reduced from 3
const BASE_BACKOFF_MS = 2000
const UNREACHABLE_COOLDOWN = 60000 // 60s before retrying unreachable API

function getProxyUrl(): string | null {
  return process.env.ZAI_PROXY_URL || null
}

export function isProxyMode(): boolean {
  return !!getProxyUrl()
}

// ============================================
// STATE
// ============================================

let zaiInstance: ZAI | null = null
let lastRequestTime = 0
const queue: QueueItem[] = []
let isProcessing = false
let connectivityTested = false
let connectivityOk = false
let rateLimitInfo: RateLimitInfo | null = null

// CRITICAL: API unreachable detection
let apiUnreachable = false
let apiUnreachableSince = 0

function markApiUnreachable() {
  apiUnreachable = true
  apiUnreachableSince = Date.now()
  console.warn('[ZAI-SDK] API marked as UNREACHABLE. Will skip requests for 60s.')
}

function isApiUnreachable(): boolean {
  if (!apiUnreachable) return false
  // Allow retry after cooldown period
  if (Date.now() - apiUnreachableSince > UNREACHABLE_COOLDOWN) {
    console.log('[ZAI-SDK] Unreachable cooldown expired, retrying...')
    apiUnreachable = false
    return false
  }
  return true
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('fetch failed') ||
           msg.includes('econnrefused') ||
           msg.includes('enotfound') ||
           msg.includes('econnreset') ||
           msg.includes('timeout') ||
           msg.includes('network') ||
           msg.includes('aborted') ||
           msg.includes('socket hang up')
  }
  return false
}

// ============================================
// SDK MANAGEMENT
// ============================================

export function resetZAI(): void {
  zaiInstance = null
  connectivityTested = false
  connectivityOk = false
  rateLimitInfo = null
  apiUnreachable = false
  apiUnreachableSince = 0
}

export async function getZAI(): Promise<ZAI> {
  if (zaiInstance) return zaiInstance

  try {
    zaiInstance = await ZAI.create()
    console.log('[ZAI-SDK] ZAI SDK initialized successfully')
    return zaiInstance
  } catch (error) {
    console.error('[ZAI-SDK] Failed to initialize ZAI SDK:', error)
    markApiUnreachable()
    throw new Error('ZAI SDK initialization failed. Check .z-ai-config file.')
  }
}

function getZAIConfig(zai: ZAI): ZAIConfig {
  return (zai as any).config as ZAIConfig
}

function buildAuthHeaders(config: ZAIConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
    ...(config.chatId ? { 'X-Chat-Id': config.chatId } : {}),
    ...(config.userId ? { 'X-User-Id': config.userId } : {}),
    ...(config.token ? { 'X-Token': config.token } : {}),
  }
}

// ============================================
// CONNECTIVITY TEST
// ============================================

export async function testConnectivity(): Promise<{
  ok: boolean
  latency: number
  error?: string
  rateLimits?: RateLimitInfo
}> {
  // If API is known unreachable, return immediately
  if (isApiUnreachable()) {
    return { ok: false, latency: 0, error: 'API unreachable (network error)' }
  }

  if (isProxyMode()) {
    const proxyUrl = getProxyUrl()!
    try {
      const start = Date.now()
      const res = await fetch(`${proxyUrl}/api/ai-enhance-tile?health=1`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT)
      })
      const latency = Date.now() - start

      if (res.ok) {
        connectivityOk = true
        connectivityTested = true
        return { ok: true, latency }
      } else {
        return { ok: false, latency, error: `Proxy returned ${res.status}` }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      markApiUnreachable()
      return { ok: false, latency: 0, error: message }
    }
  }

  try {
    const zai = await getZAI()
    const config = getZAIConfig(zai)
    const start = Date.now()

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildAuthHeaders(config),
      body: JSON.stringify({
        model: 'glm-4v-flash',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        thinking: { type: 'disabled' }
      }),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT)
    })

    const latency = Date.now() - start

    const rl: RateLimitInfo = {
      qpsLimit: parseInt(response.headers.get('x-ratelimit-limit-qps') || '2'),
      dailyLimit: parseInt(response.headers.get('x-ratelimit-limit-daily') || '300'),
      tenMinLimit: parseInt(response.headers.get('x-ratelimit-ip-10min-limit') || '10'),
      dailyRemaining: parseInt(response.headers.get('x-ratelimit-remaining-daily') || '300'),
      tenMinRemaining: parseInt(response.headers.get('x-ratelimit-ip-10min-remaining') || '10'),
    }
    rateLimitInfo = rl

    if (response.ok || response.status === 429) {
      connectivityOk = true
      connectivityTested = true
      apiUnreachable = false // Reset unreachable flag on success
      return { ok: true, latency, rateLimits: rl, error: response.status === 429 ? 'Rate limited (429)' : undefined }
    } else {
      const body = await response.text().catch(() => '')
      return { ok: false, latency, error: `HTTP ${response.status}: ${body.slice(0, 200)}` }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (isNetworkError(err)) {
      markApiUnreachable()
    }
    return { ok: false, latency: 0, error: message }
  }
}

// ============================================
// RATE-LIMITED REQUEST QUEUE
// ============================================

async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0) return
  isProcessing = true

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item) break

    // Skip if API is unreachable
    if (isApiUnreachable()) {
      item.reject(new Error('ZAI API unreachable'))
      continue
    }

    const now = Date.now()
    const timeSinceLast = now - lastRequestTime
    if (timeSinceLast < MIN_REQUEST_INTERVAL) {
      await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - timeSinceLast))
    }

    lastRequestTime = Date.now()

    try {
      const result = await item.fn()
      item.resolve(result)
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)

      // Network error → mark unreachable, don't retry
      if (isNetworkError(error)) {
        markApiUnreachable()
        item.reject(error)
        continue
      }

      // 429 rate limit → retry with backoff
      if (errMsg.includes('429') || errMsg.includes('rate')) {
        if (item.retries < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, item.retries)
          console.warn(`[ZAI-SDK] Rate limited, retrying in ${backoff}ms (attempt ${item.retries + 1}/${MAX_RETRIES})`)
          await new Promise(r => setTimeout(r, backoff))
          item.retries++
          queue.unshift(item)
          continue
        }
      }
      item.reject(error)
    }
  }

  isProcessing = false
}

export function queueRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    queue.push({
      fn: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject: reject as (reason: unknown) => void,
      retries: 0
    })
    processQueue()
  })
}

// ============================================
// AI IMAGE GENERATION
// ============================================

export async function generateAIImage(prompt: string, size: string = '1024x1024'): Promise<{
  base64: string
  model: string
}> {
  if (isApiUnreachable()) {
    throw new Error('ZAI API unreachable')
  }

  const zai = await getZAI()
  const config = getZAIConfig(zai)

  const response = await fetch(`${config.baseUrl}/images/generations`, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify({ prompt, size }),
    signal: AbortSignal.timeout(API_TIMEOUT_IMAGE)
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Image generation failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const data = await response.json()

  if (data.data && data.data.length > 0) {
    const imageData = data.data[0]

    if (imageData.base64) {
      return { base64: imageData.base64, model: data.model || 'z-ai-image-gen' }
    }

    if (imageData.url) {
      console.log('[ZAI-SDK] Image returned as URL, fetching...')
      const imgResponse = await fetch(imageData.url, {
        signal: AbortSignal.timeout(API_TIMEOUT_IMAGE)
      })

      if (!imgResponse.ok) {
        throw new Error(`Failed to fetch generated image from URL: ${imgResponse.status}`)
      }

      const arrayBuffer = await imgResponse.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      return { base64, model: data.model || 'z-ai-image-gen' }
    }
  }

  throw new Error('No image data returned from ZAI API')
}

// ============================================
// VISION ANALYSIS
// ============================================

export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  prompt: string
): Promise<string> {
  if (isApiUnreachable()) {
    throw new Error('ZAI API unreachable')
  }

  const zai = await getZAI()
  const config = getZAIConfig(zai)
  const dataUrl = `data:${mimeType};base64,${imageBase64}`

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildAuthHeaders(config),
    body: JSON.stringify({
      model: 'glm-4v-flash',
      messages: [
        {
          role: 'system',
          content: 'You are a satellite imagery analyst. Describe what you see concisely and accurately.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      max_tokens: 150,
      thinking: { type: 'disabled' }
    }),
    signal: AbortSignal.timeout(API_TIMEOUT)
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`VLM analysis failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// ============================================
// PROXY MODE HELPERS
// ============================================

export async function proxyTileRequest(params: {
  z: number
  x: number
  y: number
  quality?: string
  mode?: string
  region?: string
  pipeline?: 'fast' | 'full'
}): Promise<{
  imageBuffer: ArrayBuffer
  contentType: string
  enhanced: boolean
  cached: boolean
}> {
  const proxyUrl = getProxyUrl()
  if (!proxyUrl) {
    throw new Error('ZAI_PROXY_URL not set — cannot proxy request')
  }

  const url = new URL('/api/ai-enhance-tile', proxyUrl)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value))
  })

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'image/png, image/*'
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(PROXY_TIMEOUT)
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`Proxy request failed (${response.status}): ${errorBody.slice(0, 200)}`)
  }

  const imageBuffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') || 'image/png'
  const enhanced = response.headers.get('x-enhanced') === 'ai'
  const cached = response.headers.get('x-cache') === 'HIT'

  return { imageBuffer, contentType, enhanced, cached }
}

// ============================================
// QUEUE STATUS
// ============================================

export function getQueueStatus(): {
  queueLength: number
  isProcessing: boolean
  connectivityOk: boolean
  connectivityTested: boolean
  rateLimits: RateLimitInfo | null
  proxyMode: boolean
  proxyUrl: string | null
  apiUnreachable: boolean
} {
  return {
    queueLength: queue.length,
    isProcessing,
    connectivityOk,
    connectivityTested,
    rateLimits: rateLimitInfo,
    proxyMode: isProxyMode(),
    proxyUrl: getProxyUrl(),
    apiUnreachable: isApiUnreachable()
  }
}
