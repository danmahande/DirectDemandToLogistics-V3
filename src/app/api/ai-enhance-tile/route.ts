import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// ============================================
// AI TILE ENHANCEMENT API
// ============================================
// Server-side AI image generation for satellite tile enhancement.
//
// Uses z-ai-web-dev-sdk to generate photorealistic enhanced
// satellite tile imagery based on geographic context prompts.
//
// Flow:
// 1. Receive tile coordinates + original tile URL
// 2. Fetch the original satellite tile image
// 3. Generate an AI-enhanced version using image generation
// 4. Return the enhanced tile image
// 5. Cache results server-side for future requests
// ============================================

interface AITileCacheEntry {
  data: ArrayBuffer
  timestamp: number
  contentType: string
  source: 'ai' | 'original'
  prompt: string
  quality: string
  mode: string
}

const aiTileCache = new Map<string, AITileCacheEntry>()
const CACHE_DURATION = 48 * 60 * 60 * 1000 // 48 hours for AI-enhanced tiles
const MAX_CACHE_SIZE = 3000
const MAX_ORIGINAL_CACHE = 5000

// Original tile cache (shared with enhance-tile route)
const originalTileCache = new Map<string, {
  data: ArrayBuffer
  timestamp: number
  contentType: string
}>()

// Prune cache when too large
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pruneCache(cache: Map<string, any>, maxSize: number) {
  if (cache.size <= maxSize) return

  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)

  const toRemove = Math.floor(entries.length * 0.25)
  for (let i = 0; i < toRemove; i++) {
    cache.delete(entries[i][0])
  }
  console.log(`[AIEnhanceTile] Pruned ${toRemove} entries, ${cache.size} remaining`)
}

// ============================================
// HELPER: Fetch original tile
// ============================================

async function fetchOriginalTile(tileUrl: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  // Check cache first
  const cached = originalTileCache.get(tileUrl)
  if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
    return { data: cached.data, contentType: cached.contentType }
  }

  const response = await fetch(tileUrl, {
    headers: {
      'User-Agent': 'DirectDDL-Navigation/3.0',
      'Accept': 'image/png, image/jpeg, image/*'
    },
    signal: AbortSignal.timeout(15000)
  })

  if (!response.ok) {
    throw new Error(`Tile fetch failed: ${response.status}`)
  }

  const data = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') || 'image/png'

  // Cache it
  originalTileCache.set(tileUrl, {
    data,
    timestamp: Date.now(),
    contentType
  })
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

// ============================================
// HELPER: Convert ArrayBuffer to base64
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
      return '1344x768'   // Wider for ultra quality
    case 'high':
      return '1024x1024'  // Standard high quality
    case 'standard':
    default:
      return '1024x1024'  // Standard quality
  }
}

// ============================================
// GET: Quick cache check / retrieval
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const z = searchParams.get('z')
    const x = searchParams.get('x')
    const y = searchParams.get('y')
    const quality = searchParams.get('quality') || 'high'
    const mode = searchParams.get('mode') || 'enhanced-satellite'
    const region = searchParams.get('region') || undefined

    if (!z || !x || !y) {
      return NextResponse.json({ error: 'z, x, y parameters required' }, { status: 400 })
    }

    const cacheKey = `${z}/${x}/${y}/${quality}/${mode}`

    // Check AI cache
    const cached = aiTileCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=172800', // 48h
          'X-Cache': 'HIT',
          'X-Enhanced': 'ai',
          'X-Enhancement-Mode': cached.mode,
          'X-Quality': cached.quality
        }
      })
    }

    // Not cached — return info about how to trigger enhancement
    return NextResponse.json({
      message: 'AI-enhanced tile not cached. Use POST to generate.',
      cacheKey,
      quality,
      mode
    })

  } catch (error) {
    console.error('[AIEnhanceTile] GET error:', error)
    return NextResponse.json({ error: 'AI tile check failed' }, { status: 500 })
  }
}

// ============================================
// POST: Generate AI-enhanced tile
// ============================================

export async function POST(request: NextRequest) {
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

    // Build the AI prompt
    const prompt = buildEnhancementPrompt(z, x, y, mode, region, customPrompt)

    console.log(`[AIEnhanceTile] Generating AI tile for ${z}/${x}/${y} (${mode}, ${quality})`)

    // ============================================
    // AI IMAGE GENERATION
    // ============================================

    let aiImageBase64: string | null = null

    try {
      const zai = await ZAI.create()

      // If we have an original tile URL, we can use it as reference
      // by including a description in the prompt
      let finalPrompt = prompt

      if (originalUrl) {
        // Fetch the original tile to verify it exists and get context
        try {
          const originalTile = await fetchOriginalTile(originalUrl)
          // The original tile data is available — we use the prompt
          // that describes what the enhanced version should look like
          // based on the geographic context
          const originalBase64 = arrayBufferToBase64(originalTile.data)
          const originalDataUrl = `data:${originalTile.contentType};base64,${originalBase64}`

          // Use the VLM to analyze the original tile first, then enhance
          try {
            const analysisResult = await zai.chat.completions.create({
              messages: [
                {
                  role: 'system',
                  content: 'You are a satellite imagery analyst. Describe what you see in this satellite tile image in detail, focusing on terrain, buildings, roads, vegetation, and water features. Be specific and concise.'
                },
                {
                  role: 'user',
                  content: [
                    { type: 'text' as const, text: 'Describe this satellite tile at zoom level ' + z + ' in detail:' },
                    { type: 'image_url' as const, image_url: { url: originalDataUrl } }
                  ] as unknown as string
                }
              ]
            })

            const tileDescription = analysisResult.choices?.[0]?.message?.content || ''
            if (tileDescription) {
              finalPrompt = `Based on satellite imagery showing: ${tileDescription}. ${prompt}. Ensure the enhanced version maintains geographic accuracy while dramatically improving visual clarity and detail.`
            }
          } catch (vlmError) {
            console.warn('[AIEnhanceTile] VLM analysis failed, using base prompt:', vlmError)
          }
        } catch (fetchError) {
          console.warn('[AIEnhanceTile] Original tile fetch failed, using base prompt:', fetchError)
        }
      }

      // Generate the AI-enhanced tile image
      const imageSize = getImageSizeForQuality(quality)

      const generationResponse = await zai.images.generations.create({
        prompt: finalPrompt,
        size: imageSize
      })

      if (generationResponse.data && generationResponse.data.length > 0) {
        aiImageBase64 = generationResponse.data[0].base64 || null
      }
    } catch (aiError) {
      console.error('[AIEnhanceTile] AI generation failed:', aiError)
      // Fall back to original tile if available
    }

    // ============================================
    // HANDLE RESULT
    // ============================================

    if (aiImageBase64) {
      // Convert base64 to ArrayBuffer
      const buffer = Buffer.from(aiImageBase64, 'base64')
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

      // Cache the AI result
      aiTileCache.set(cacheKey, {
        data: arrayBuffer,
        timestamp: Date.now(),
        contentType: 'image/png',
        source: 'ai',
        prompt,
        quality,
        mode
      })
      pruneCache(aiTileCache, MAX_CACHE_SIZE)

      console.log(`[AIEnhanceTile] AI tile generated and cached: ${cacheKey}`)

      return new NextResponse(arrayBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=172800',
          'X-Cache': 'MISS',
          'X-Enhanced': 'ai',
          'X-Enhancement-Mode': mode,
          'X-Quality': quality
        }
      })
    }

    // ============================================
    // FALLBACK: Return original tile
    // ============================================

    if (originalUrl) {
      try {
        const originalTile = await fetchOriginalTile(originalUrl)

        return new NextResponse(originalTile.data, {
          headers: {
            'Content-Type': originalTile.contentType,
            'Cache-Control': 'public, max-age=3600',
            'X-Cache': 'MISS',
            'X-Enhanced': 'original',
            'X-Fallback': 'true'
          }
        })
      } catch (fallbackError) {
        console.error('[AIEnhanceTile] Fallback to original failed:', fallbackError)
      }
    }

    // No fallback available
    return NextResponse.json({
      error: 'AI enhancement failed and no fallback available',
      fallback: true
    }, { status: 503 })

  } catch (error) {
    console.error('[AIEnhanceTile] POST error:', error)
    return NextResponse.json({
      error: 'AI tile enhancement failed',
      fallback: true
    }, { status: 500 })
  }
}
