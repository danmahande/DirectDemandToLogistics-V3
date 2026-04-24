import { NextRequest, NextResponse } from 'next/server'

// Simple tile proxy with caching - enhancement is done client-side via WebGL
const tileCache = new Map<string, { data: ArrayBuffer; timestamp: number }>()
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tileUrl = searchParams.get('url')
    const z = searchParams.get('z')
    const x = searchParams.get('x')
    const y = searchParams.get('y')

    if (!tileUrl) {
      return NextResponse.json({ error: 'Tile URL required' }, { status: 400 })
    }

    const cacheKey = `${z}/${x}/${y}`
    
    // Check cache
    const cached = tileCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT'
        }
      })
    }

    // Fetch tile
    const response = await fetch(tileUrl, {
      headers: {
        'User-Agent': 'DirectDDL-Navigation/1.0',
        'Accept': 'image/png, image/jpeg, image/*'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Tile fetch failed' }, { status: response.status })
    }

    const arrayBuffer = await response.arrayBuffer()
    
    // Cache it
    tileCache.set(cacheKey, {
      data: arrayBuffer,
      timestamp: Date.now()
    })

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS'
      }
    })

  } catch (error) {
    console.error('[TileProxy] Error:', error)
    return NextResponse.json({ error: 'Tile proxy failed' }, { status: 500 })
  }
}
