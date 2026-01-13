import { NextRequest, NextResponse } from 'next/server'
import { createToken } from '@/lib/livekit'
import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function POST(request: NextRequest) {
  try {
    const { roomId, participantName } = await request.json()

    if (!roomId || !participantName) {
      return NextResponse.json(
        { error: 'Room ID and participant name are required' },
        { status: 400 }
      )
    }

    // Verify room exists
    const room = await prisma.room.findUnique({
      where: { id: roomId },
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

    // Generate LiveKit token
    const token = await createToken(roomId, participantName, participantIdentity)

    return NextResponse.json({
      token,
      roomName: roomId,
      participantIdentity,
      meetingId: meeting.id,
    })
  } catch (error) {
    console.error('Failed to generate token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
