import { NextResponse } from 'next/server'
import { isDeepgramConfigured, getDeepgramModel, getDeepgramLanguage } from '@/lib/deepgram'

// Force dynamic - env vars are set at runtime, not build time
export const dynamic = 'force-dynamic'

/**
 * GET /api/transcribe/deepgram/status
 * Check if Deepgram transcription is available
 */
export async function GET() {
  return NextResponse.json({
    available: isDeepgramConfigured(),
    model: getDeepgramModel(),
    language: getDeepgramLanguage(), // 'multi' = Multilingual Code Switching
  })
}
