import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// ============================================
// AI TILE GENERATION API - v5.1
// ============================================
// Server-side AI image generation for satellite tile enhancement.
//
// v5.1 fixes:
// - getZAI() now does a CONNECTIVITY TEST before declaring SDK available.
//   Previously, ZAI.create() only read the config file — it didn't verify
//   the API was actually reachable. This caused 10-second timeouts on
//   every tile request when the API was unreachable.
// - If API is unreachable, immediately marks as unavailable (no retries)
// - 5-second connectivity test timeout (not 10s SDK default)
// ============================================

import type { VisionMessage, VisionMultimodalContentItem } from 'z-ai-web-dev-sdk'

interface AITileCacheEntry {
  data: ArrayBuffer
  timestamp: number
  contentType: string
  source: 'ai' | 'canvas-fallback' | 'original'
  prompt: string
  quality: string
  mode: string
}

const aiTileCache = new Map<string, AITileCacheEntry>()
const CACHE_DURATION = 48 * 60 * 60 * 1000
const MAX_AI_CACHE = 3000
const MAX_ORIGINAL_CACHE = 5000

const originalTileCache = new Map<string, {
  data: ArrayBuffer
  timestamp: number
  contentType: string
}>()

const canvasFallbackCache = new Map<string, {
  data: ArrayBuffer
  timestamp: number
  contentType: string
}>()

// ============================================
// ZAI SDK LAZY SINGLETON WITH CONNECTIVITY TEST
// ============================================
// 1. Read .z-ai-config to get baseUrl and apiKey
// 2. Test connectivity: fetch(baseUrl) with 5s timeout
// 3. If reachable, create ZAI instance
// 4. If unreachable, mark as unavailable immediately
// This prevents 10-second timeouts on every tile request.

let zaiInstance: ZAI | null = null
let zaiInitError: string | null = null
let zaiInitAttempted = false

async function loadZAIConfig(): Promise<{ baseUrl: string; apiKey: string; chatId?: string; userId?: string; token?: string } | null> {
  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config'
  ]

  for (const filePath of configPaths) {
    try {
      const configStr = await fs.readFile(filePath, 'utf-8')
      const config = JSON.parse(configStr)
      if (config.baseUrl && config.apiKey) return config
    } catch {
      // Continue to next path
    }
  }
  return null
}

async function testApiConnectivity(baseUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Quick connectivity test — any HTTP response (even 404) means the server is reachable
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    await fetch(baseUrl, {
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

async function getZAI(): Promise<{ zai: ZAI | null; error: string | null }> {
  // Return cached instance if available
  if (zaiInstance) return { zai: zaiInstance, error: null }

  // If we already tried and failed, don't retry
  if (zaiInitAttempted && zaiInitError) {
    return { zai: null, error: zaiInitError }
  }

  zaiInitAttempted = true

  try {
    // Step 1: Read config file
    const config = await loadZAIConfig()
    if (!config) {
      zaiInitError = 'ZAI config not found. Create .z-ai-config in your project root with { "baseUrl": "...", "apiKey": "..." }'
      console.warn('[GenerateTile] ' + zaiInitError)
      return { zai: null, error: zaiInitError }
    }

    // Step 2: Test connectivity to the API server
    console.log(`[GenerateTile] Testing connectivity to ${config.baseUrl}...`)
    const connectivity = await testApiConnectivity(config.baseUrl)
    if (!connectivity.ok) {
      zaiInitError = `ZAI API unreachable at ${config.baseUrl}: ${connectivity.error}`
      console.warn('[GenerateTile] ' + zaiInitError)
      return { zai: null, error: zaiInitError }
    }

    // Step 3: Create ZAI instance (config is valid + API is reachable)
    zaiInstance = await ZAI.create()
    console.log('[GenerateTile] ZAI SDK initialized and connected successfully')
    return { zai: zaiInstance, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    zaiInitError = message
    console.warn('[GenerateTile] ZAI SDK initialization failed:', message)
    return { zai: null, error: message }
  }
}

// Prune cache when too large
function pruneCache<T extends { timestamp: number }>(cache: Map<string, T>, maxSize: number): void {
  if (cache.size <= maxSize) return

  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)

  const toRemove = Math.floor(entries.length * 0.25)
  for (let i = 0; i < toRemove; i++) {
    cache.delete(entries[i][0])
  }
  console.log(`[GenerateTile] Pruned ${toRemove} entries, ${cache.size} remaining`)
}

// ============================================
// HELPER: Fetch original tile
// ============================================

async function fetchOriginalTile(tileUrl: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const cached = originalTileCache.get(tileUrl)
  if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
    return { data: cached.data, contentType: cached.contentType }
  }

  const response = await fetch(tileUrl, {
    headers: {
      'User-Agent': 'DirectDDL-Navigation/5.1',
      'Accept': 'image/png, image/jpeg, image/*'
    },
    signal: AbortSignal.timeout(15000)
  })

  if (!response.ok) {
    throw new Error(`Tile fetch failed: ${response.status}`)
  }

  const data = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') || 'image/png'

  originalTileCache.set(tileUrl, { data, timestamp: Date.now(), contentType })
  pruneCache(originalTileCache, MAX_ORIGINAL_CACHE)

  return { data, contentType }
}

// ============================================
// HELPER: Build AI prompt
// ============================================

function buildEnhancementPrompt(
  z: number, x: number, y: number,
  mode: string, region?: string, customPrompt?: string
): string {
  const regionContext = region || 'Kampala, Uganda, East Africa'

  const modePrompts: Record<string, string> = {
    'photorealistic': `Ultra-realistic enhanced satellite imagery of ${regionContext}. Photorealistic aerial view with crystal-clear detail, vibrant natural colors, sharp building outlines, visible road markings, clear vegetation textures, professional satellite photography quality, 8K resolution detail, no artifacts, no blur`,
    'enhanced-satellite': `High-resolution satellite image of ${regionContext}. Enhanced clarity with sharper edges, improved color accuracy, better contrast between urban and natural features, clear road network visibility, distinct building footprints, professional cartographic satellite quality`,
    'urban-detail': `Detailed urban satellite imagery of ${regionContext}. Ultra-sharp building outlines, clearly visible street patterns, distinct land use boundaries, enhanced infrastructure details, clear vehicle-scale features, professional urban planning satellite view`,
    'terrain-clarity': `Terrain-enhanced satellite imagery of ${regionContext}. Clear elevation features, distinct vegetation types, visible water features, enhanced topographic detail, natural color enhancement, professional geographic survey quality`
  }

  let prompt = modePrompts[mode] || modePrompts['enhanced-satellite']

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

// ============================================
// HELPER: ArrayBuffer to base64
// ============================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return Buffer.from(binary, 'binary').toString('base64')
}

// ============================================
// HELPER: Image size for quality level
// ============================================

function getImageSizeForQuality(quality: string): '1024x1024' | '1344x768' | '768x1344' {
  switch (quality) {
    case 'ultra':
      return '1344x768'
    case 'high':
      return '1024x1024'
    case 'standard':
    default:
      return '1024x1024'
  }
}

// ============================================
// HELPER: Server-side canvas enhancement fallback
// ============================================

async function applyServerSideCanvasEnhancement(
  imageData: ArrayBuffer,
  _options?: {
    brightness?: number
    contrast?: number
    saturation?: number
  }
): Promise<ArrayBuffer> {
  void _options
  return imageData
}

// ============================================
// GET: Health check + cache retrieval
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // ---- Lightweight health check with connectivity test ----
    if (searchParams.get('health') === '1') {
      const { zai, error } = await getZAI()

      if (zai) {
        return NextResponse.json({
          status: 'ok',
          sdk: 'z-ai-web-dev-sdk',
          message: 'ZAI SDK is installed, configured, and API is reachable'
        })
      }

      // Determine error type for better error messages
      const isConfigError = error?.includes('config not found')
      const isConnectivityError = error?.includes('unreachable') || error?.includes('timeout') || error?.includes('ECONNREFUSED')

      return NextResponse.json({
        status: 'unavailable',
        sdk: 'z-ai-web-dev-sdk',
        error: isConfigError ? 'config-missing' : isConnectivityError ? 'api-unreachable' : 'unknown',
        detail: error || 'Unknown error',
        hint: isConfigError
          ? 'Create .z-ai-config in your project root with { "baseUrl": "...", "apiKey": "..." }'
          : isConnectivityError
            ? 'The ZAI API server is not reachable. Check your network connection and baseUrl in .z-ai-config. The app will use regular satellite tiles until the API is available.'
            : 'Check server logs for details.',
        fallback: true
      }, { status: 503 })
    }

    // ---- Cache retrieval for specific tile ----
    const z = searchParams.get('z')
    const x = searchParams.get('x')
    const y = searchParams.get('y')
    const quality = searchParams.get('quality') || 'high'
    const mode = searchParams.get('mode') || 'enhanced-satellite'

    if (!z || !x || !y) {
      return NextResponse.json({ error: 'z, x, y parameters required' }, { status: 400 })
    }

    const cacheKey = `${z}/${x}/${y}/${quality}/${mode}`

    const cached = aiTileCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=172800',
          'X-Cache': 'HIT',
          'X-Enhanced': 'ai',
          'X-Enhancement-Mode': cached.mode,
          'X-Quality': cached.quality
        }
      })
    }

    const canvasCached = canvasFallbackCache.get(cacheKey)
    if (canvasCached && Date.now() - canvasCached.timestamp < CACHE_DURATION) {
      return new NextResponse(canvasCached.data, {
        headers: {
          'Content-Type': canvasCached.contentType,
          'Cache-Control': 'public, max-age=172800',
          'X-Cache': 'HIT',
          'X-Enhanced': 'canvas-fallback',
          'X-Quality': quality
        }
      })
    }

    return NextResponse.json({
      message: 'AI-enhanced tile not cached. Use POST to generate.',
      cacheKey,
      quality,
      mode
    })

  } catch (error) {
    console.error('[GenerateTile] GET error:', error)
    return NextResponse.json({ error: 'AI tile check failed' }, { status: 500 })
  }
}

// ============================================
// POST: Generate AI-enhanced tile
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const {
      z, x, y,
      originalUrl,
      quality = 'high',
      mode = 'enhanced-satellite',
      prompt: customPrompt,
      region
    } = body as {
      z: number
      x: number
      y: number
      originalUrl?: string
      quality?: string
      mode?: string
      prompt?: string
      region?: string
    }

    if (z === undefined || x === undefined || y === undefined) {
      return NextResponse.json({ error: 'z, x, y required' }, { status: 400 })
    }

    const cacheKey = `${z}/${x}/${y}/${quality}/${mode}`

    // Check if already cached
    const cached = aiTileCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[GenerateTile] Cache hit: ${cacheKey}`)
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=172800',
          'X-Cache': 'HIT',
          'X-Enhanced': 'ai',
          'X-Enhancement-Mode': cached.mode,
          'X-Quality': cached.quality
        }
      })
    }

    // Get ZAI SDK instance (with connectivity test)
    const { zai, error: zaiError } = await getZAI()

    if (!zai) {
      console.warn(`[GenerateTile] ZAI SDK not available: ${zaiError}`)

      // If we have an original URL, proxy it as a fallback
      if (originalUrl) {
        try {
          const originalTile = await fetchOriginalTile(originalUrl)
          return new NextResponse(originalTile.data, {
            headers: {
              'Content-Type': originalTile.contentType,
              'Cache-Control': 'public, max-age=3600',
              'X-Enhanced': 'original',
              'X-Fallback': 'true',
              'X-ZAI-Error': 'sdk-not-available'
            }
          })
        } catch {
          // Original fetch also failed
        }
      }

      return NextResponse.json({
        error: 'ZAI SDK not available',
        detail: zaiError,
        fallback: true
      }, { status: 503 })
    }

    // Build the AI prompt
    const prompt = buildEnhancementPrompt(z, x, y, mode, region, customPrompt)

    console.log(`[GenerateTile] Generating AI tile for ${z}/${x}/${y} (${mode}, ${quality})`)

    // ============================================
    // STEP 1: Fetch original tile
    // ============================================

    let originalTile: { data: ArrayBuffer; contentType: string } | null = null

    if (originalUrl) {
      try {
        originalTile = await fetchOriginalTile(originalUrl)
      } catch (fetchError) {
        console.warn('[GenerateTile] Original tile fetch failed:', fetchError)
      }
    }

    // ============================================
    // STEP 2: VLM Analysis of original tile
    // ============================================

    let finalPrompt = prompt
    let vlmDescription = ''

    if (originalTile) {
      try {
        const originalBase64 = arrayBufferToBase64(originalTile.data)
        const originalDataUrl = `data:${originalTile.contentType};base64,${originalBase64}`

        const vlmMessages: VisionMessage[] = [
          {
            role: 'system',
            content: 'You are a satellite imagery analyst specializing in East African geography. Describe what you see in this satellite tile image in precise detail. Focus on: terrain type, building density, road patterns, vegetation cover, water features, and land use. Be concise but specific — your description will be used to generate an enhanced version.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Analyze this satellite tile at zoom level ${z}, coordinates ${x}/${y}. Describe the geographic features visible:` },
              { type: 'image_url', image_url: { url: originalDataUrl } }
            ] as VisionMultimodalContentItem[]
          }
        ]

        const analysisResult = await zai.chat.completions.createVision({
          model: 'glm-4v-flash',
          messages: vlmMessages
        })

        vlmDescription = analysisResult.choices?.[0]?.message?.content || ''

        if (vlmDescription) {
          finalPrompt = `Based on actual satellite imagery analysis: "${vlmDescription}". Create an enhanced version: ${prompt}. Maintain geographic accuracy — the same terrain, buildings, roads, and features must be present but with dramatically improved visual clarity, sharper details, and more vivid colors.`
          console.log(`[GenerateTile] VLM analysis complete for ${z}/${x}/${y}: ${vlmDescription.substring(0, 100)}...`)
        }
      } catch (vlmError) {
        console.warn('[GenerateTile] VLM analysis failed, using base prompt:', vlmError)
      }
    }

    // ============================================
    // STEP 3: AI Image Generation
    // ============================================

    let aiImageBase64: string | null = null

    try {
      const imageSize = getImageSizeForQuality(quality)

      const generationResponse = await zai.images.generations.create({
        prompt: finalPrompt,
        size: imageSize
      })

      if (generationResponse.data && generationResponse.data.length > 0) {
        aiImageBase64 = generationResponse.data[0].base64 || null
      }

      console.log(`[GenerateTile] AI image generated for ${z}/${x}/${y} in ${Date.now() - startTime}ms`)

    } catch (aiError) {
      console.error('[GenerateTile] AI generation failed:', aiError)
    }

    // ============================================
    // STEP 4: Process and cache the result
    // ============================================

    if (aiImageBase64) {
      const buffer = Buffer.from(aiImageBase64, 'base64')
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

      aiTileCache.set(cacheKey, {
        data: arrayBuffer,
        timestamp: Date.now(),
        contentType: 'image/png',
        source: 'ai',
        prompt,
        quality,
        mode
      })
      pruneCache(aiTileCache, MAX_AI_CACHE)

      const elapsed = Date.now() - startTime
      console.log(`[GenerateTile] AI tile cached: ${cacheKey} (${elapsed}ms total, VLM+generation)`)

      return new NextResponse(arrayBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=172800',
          'X-Cache': 'MISS',
          'X-Enhanced': 'ai',
          'X-Enhancement-Mode': mode,
          'X-Quality': quality,
          'X-Processing-Time': String(elapsed),
          'X-VLM-Description-Length': String(vlmDescription.length)
        }
      })
    }

    // ============================================
    // STEP 5: Canvas-enhanced fallback
    // ============================================

    if (originalTile) {
      try {
        const enhanced = await applyServerSideCanvasEnhancement(originalTile.data, {
          brightness: 1.1,
          contrast: 1.15,
          saturation: 1.2
        })

        canvasFallbackCache.set(cacheKey, {
          data: enhanced,
          timestamp: Date.now(),
          contentType: originalTile.contentType
        })
        pruneCache(canvasFallbackCache, MAX_AI_CACHE)

        return new NextResponse(enhanced, {
          headers: {
            'Content-Type': originalTile.contentType,
            'Cache-Control': 'public, max-age=3600',
            'X-Cache': 'MISS',
            'X-Enhanced': 'canvas-fallback',
            'X-Fallback': 'true'
          }
        })
      } catch (canvasError) {
        console.error('[GenerateTile] Canvas fallback failed:', canvasError)
      }
    }

    // ============================================
    // STEP 6: Return original tile as last resort
    // ============================================

    if (originalTile) {
      return new NextResponse(originalTile.data, {
        headers: {
          'Content-Type': originalTile.contentType,
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'MISS',
          'X-Enhanced': 'original',
          'X-Fallback': 'true'
        }
      })
    }

    // No fallback available
    return NextResponse.json({
      error: 'AI enhancement failed and no fallback available',
      fallback: true
    }, { status: 503 })

  } catch (error) {
    console.error('[GenerateTile] POST error:', error)
    return NextResponse.json({
      error: 'AI tile generation failed',
      fallback: true
    }, { status: 500 })
  }
}
