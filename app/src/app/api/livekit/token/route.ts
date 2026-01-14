import { NextRequest, NextResponse } from 'next/server'
import { createToken } from '@/lib/livekit'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function POST(request: NextRequest) {
  try {
    const { secretId, participantName } = await request.json()

    if (!secretId || !participantName) {
      return NextResponse.json(
        { error: 'Secret ID and participant name are required' },
        { status: 400 }
      )
    }

    // Find room by secretId
    const room = await prisma.room.findUnique({
      where: { secretId },
      include: {
        meetings: {
          where: { status: 'IN_PROGRESS' },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      )
    }

    let meeting = room.meetings[0]

    // If no active meeting, create one
    if (!meeting) {
      meeting = await prisma.meeting.create({
        data: {
          roomId: room.id,
        },
      })
    }

    // Generate unique participant identity
    const participantIdentity = `${participantName.toLowerCase().replace(/\s+/g, '-')}-${nanoid(6)}`

    // Create participant record
    await prisma.participant.create({
      data: {
        meetingId: meeting.id,
        name: participantName,
        identity: participantIdentity,
      },
    })

    // Generate LiveKit token using internal room.id (for webhook compatibility)
    const token = await createToken(room.id, participantName, participantIdentity)

    return NextResponse.json({
      token,
      roomName: room.id,  // Internal ID for LiveKit
      participantIdentity,
      meetingId: meeting.id,
      roomDisplayName: room.name,  // For UI display
    })
  } catch (error) {
    console.error('Failed to generate token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
