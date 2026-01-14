import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateAdminKey } from '@/lib/admin-auth'
import { getRoomServiceClient } from '@/lib/livekit'

export async function GET(request: NextRequest) {
  const auth = validateAdminKey(request)
  if (!auth.valid) return auth.error!

  try {
    // Get meetings from database
    const meetings = await prisma.meeting.findMany({
      include: {
        room: true,
        participants: {
          select: {
            id: true,
            name: true,
            identity: true,
            joinedAt: true,
            leftAt: true,
          },
        },
        _count: {
          select: {
            recordings: true,
            utterances: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    })

    // Try to get live room info from LiveKit
    let liveRooms: Map<string, number> = new Map()
    try {
      const roomService = getRoomServiceClient()
      const rooms = await roomService.listRooms()
      for (const room of rooms) {
        liveRooms.set(room.name, room.numParticipants)
      }
    } catch {
      // LiveKit may not be available
    }

    const data = meetings.map(meeting => {
      const participantsOnline = liveRooms.get(meeting.room.name) || 0
      const participantsTotal = meeting.participants.length

      return {
        id: meeting.id,
        roomId: meeting.room.id,
        roomName: meeting.room.name,
        roomSecretId: meeting.room.secretId,
        startedAt: meeting.startedAt.toISOString(),
        endedAt: meeting.endedAt?.toISOString() || null,
        status: meeting.status,
        participantsOnline,
        participantsTotal,
        participants: meeting.participants.map(p => ({
          id: p.id,
          name: p.name,
          identity: p.identity,
          joinedAt: p.joinedAt.toISOString(),
          leftAt: p.leftAt?.toISOString() || null,
          isOnline: !p.leftAt,
        })),
        recordingsCount: meeting._count.recordings,
        utterancesCount: meeting._count.utterances,
      }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Failed to fetch meetings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch meetings' },
      { status: 500 }
    )
  }
}
