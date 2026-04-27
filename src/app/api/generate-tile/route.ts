import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Redirect to enhance-tile with same query params
  const url = new URL(request.url)
  url.pathname = '/api/enhance-tile'
  return NextResponse.redirect(url)
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const enhanceUrl = `${url.origin}/api/enhance-tile`

  try {
    const body = await request.text()
    const response = await fetch(enhanceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    })

    const headers = new Headers()
    response.headers.forEach((value, key) => {
      headers.set(key, value)
    })

    return new NextResponse(response.body, {
      status: response.status,
      headers
    })
  } catch (error) {
    console.error('[generate-tile proxy] Error forwarding to enhance-tile:', error)
    return NextResponse.json({
      error: 'Tile generation proxy failed',
      fallback: true
    }, { status: 500 })
  }
}
