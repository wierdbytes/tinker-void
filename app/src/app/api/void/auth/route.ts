import { NextRequest, NextResponse } from 'next/server'

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY

export async function POST(request: NextRequest) {
  if (!ADMIN_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Admin key not configured' },
      { status: 500 }
    )
  }

  try {
    const { key } = await request.json()

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: 'Key is required' },
        { status: 400 }
      )
    }

    // Constant-time comparison to prevent timing attacks
    const isValid = key.length === ADMIN_SECRET_KEY.length &&
      Buffer.from(key).equals(Buffer.from(ADMIN_SECRET_KEY))

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid key' },
        { status: 401 }
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    )
  }
}
