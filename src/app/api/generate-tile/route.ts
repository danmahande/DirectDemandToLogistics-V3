import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import type { VisionMessage, VisionMultimodalContentItem } from 'z-ai-web-dev-sdk'

// ============================================
// AI TILE GENERATION API - v5.0
// ============================================
// This is the PRIMARY route used by:
//   - MapComponent.tsx (tileload → POST /api/generate-tile)
//   - ai-tile-enhancer.ts (processAIEnhancement → POST /api/generate-tile)
//   - aiTileGenerationService.ts (batch enhance → POST /api/generate-tile)
//
// Pipeline:
//   1. Receive tile coordinates + optional original tile URL
//   2. Fetch the original satellite tile image
//   3. VLM (Vision Language Model) analyzes the original tile
//   4. Image generator creates an enhanced version based on VLM description
//   5. Cache and return the enhanced tile
//
// ZAI SDK API Reference (z-ai-web-dev-sdk):
//   - VLM: zai.chat.completions.createVision({ model, messages: VisionMessage[] })
//   - Image Gen: zai.images.generations.create({ prompt, size })
//   - Image Gen response: { data: [{ base64: string }] }
// ============================================

// ============================================
// CACHE
// ============================================

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
const originalTileCache = new Map<string, {
  data: ArrayBuffer
  timestamp: number
  contentType: string
}>()

const AI_CACHE_DURATION = 48 * 60 * 60 * 1000
const ORIGINAL_CACHE_DURATION = 24 * 60 * 60 * 1000
const MAX_AI_CACHE = 3000
const MAX_ORIGINAL_CACHE = 5000

function pruneCache<T extends { timestamp: number }>(cache: Map<string, T>, maxSize: number): void {
  if (cache.size <= maxSize) return
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
  const toRemove = Math.floor(entries.length * 0.25)
  for (let i = 0; i < toRemove; i++) {
    cache.delete(entries[i][0])
  }
}

// ============================================
// HELPERS
// ============================================

async function fetchOriginalTile(tileUrl: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const cached = originalTileCache.get(tileUrl)
  if (cached && Date.now() - cached.timestamp < ORIGINAL_CACHE_DURATION) {
    return { data: cached.data, contentType: cached.contentType }
  }

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

  const data = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') || 'image/png'

  originalTileCache.set(tileUrl, { data, timestamp: Date.now(), contentType })
  pruneCache(originalTileCache, MAX_ORIGINAL_CACHE)

  return { data, contentType }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return Buffer.from(binary, 'binary').toString('base64')
}

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
// GET: Health check + cache retrieval
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Lightweight health check — MapComponent uses this to test if ZAI SDK
    // is installed without triggering a full AI generation cycle.
    if (searchParams.get('health') === '1') {
      try {
        const zai = await ZAI.create()
        if (zai) {
          return NextResponse.json({
            status: 'ok',
            sdk: 'z-ai-web-dev-sdk',
            message: 'ZAI SDK is installed and initialized'
          })
        }
      } catch {
        return NextResponse.json({
          status: 'error',
          sdk: 'z-ai-web-dev-sdk',
          error: 'ZAI SDK failed to initialize',
          fallback: true
        }, { status: 503 })
      }
    }

    // Cache retrieval
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

    if (cached && Date.now() - cached.timestamp < AI_CACHE_DURATION) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=172800',
          'X-Cache': 'HIT',
          'X-Enhanced': cached.source,
          'X-Enhancement-Mode': cached.mode,
          'X-Quality': cached.quality
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
    if (cached && Date.now() - cached.timestamp < AI_CACHE_DURATION) {
      console.log(`[GenerateTile] Cache hit: ${cacheKey}`)
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=172800',
          'X-Cache': 'HIT',
          'X-Enhanced': cached.source,
          'X-Enhancement-Mode': cached.mode,
          'X-Quality': cached.quality
        }
      })
    }

    const prompt = buildEnhancementPrompt(z, x, y, mode, region, customPrompt)

    console.log(`[GenerateTile] Generating AI tile for ${z}/${x}/${y} (${mode}, ${quality})`)

    // ============================================
    // STEP 1: Initialize ZAI SDK
    // ============================================

    let zai: Awaited<ReturnType<typeof ZAI.create>>
    try {
      zai = await ZAI.create()
    } catch (sdkError) {
      console.error('[GenerateTile] ZAI SDK initialization failed:', sdkError)
      return NextResponse.json({
        error: 'ZAI SDK not available',
        fallback: true,
        details: 'Run: npm install z-ai-web-dev-sdk'
      }, { status: 503 })
    }

    // ============================================
    // STEP 2: Fetch original tile
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
    // STEP 3: VLM Analysis of original tile
    // ============================================
    // Uses createVision() — the CORRECT SDK method for multimodal VLM calls.
    // create() only accepts ChatMessage[] (string content).
    // createVision() accepts VisionMessage[] with image_url content.
    // The model parameter is REQUIRED for createVision().

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
    // STEP 4: AI Image Generation
    // ============================================
    // zai.images.generations.create() returns ImageGenerationResponse
    // which has data: [{ base64: string }] — NO url property.

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
    // STEP 5: Process and cache the result
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
      console.log(`[GenerateTile] AI tile cached: ${cacheKey} (${elapsed}ms total)`)

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
    // STEP 6: Fallback — return original tile
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

    return NextResponse.json({
      error: 'AI enhancement failed and no fallback available',
      fallback: true
    }, { status: 503 })

  } catch (error) {
    console.error('[GenerateTile] POST error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isSdkError = errorMessage.includes('z-ai-web-dev-sdk') ||
                       errorMessage.includes('Cannot find module') ||
                       errorMessage.includes('ZAI')

    return NextResponse.json({
      error: 'AI tile generation failed',
      fallback: true,
      details: isSdkError ? 'ZAI SDK not installed. Run: npm install z-ai-web-dev-sdk' : errorMessage
    }, { status: isSdkError ? 503 : 500 })
  }
}
