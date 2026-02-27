import { NextRequest, NextResponse } from 'next/server'
import { validateAdminKey } from '@/lib/admin-auth'
import { getRoomServiceClient } from '@/lib/livekit'

export async function POST(request: NextRequest) {
  const auth = validateAdminKey(request)
  if (!auth.valid) return auth.error!

  try {
    const { roomName } = await request.json()

    if (!roomName || typeof roomName !== 'string') {
      return NextResponse.json(
        { error: 'Room name is required' },
        { status: 400 }
      )
    }

    const roomService = getRoomServiceClient()
    await roomService.deleteRoom(roomName)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to close room:', error)
    return NextResponse.json(
      { error: 'Failed to close room' },
      { status: 500 }
    )
  }
}
