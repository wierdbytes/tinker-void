import { NextRequest, NextResponse } from 'next/server'

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY

export function validateAdminKey(request: NextRequest): { valid: boolean; error?: NextResponse } {
  if (!ADMIN_SECRET_KEY) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: 'Admin key not configured' },
        { status: 500 }
      )
    }
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
  }

  const key = authHeader.slice(7)

  // Constant-time comparison
  const isValid = key.length === ADMIN_SECRET_KEY.length &&
    Buffer.from(key).equals(Buffer.from(ADMIN_SECRET_KEY))

  if (!isValid) {
    return {
      valid: false,
      error: NextResponse.json(
        { error: 'Invalid key' },
        { status: 401 }
      )
    }
  }

  return { valid: true }
}
