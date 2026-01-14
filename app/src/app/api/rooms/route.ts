import { NextRequest, NextResponse } from 'next/server'
import { customAlphabet } from 'nanoid'
import { prisma } from '@/lib/prisma'

// 12-char alphanumeric secretId (62^12 = 3.2×10²¹ combinations)
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const generateSecretId = customAlphabet(alphabet, 12)

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json()

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Room name is required' },
        { status: 400 }
      )
    }

    const secretId = generateSecretId()

    const room = await prisma.room.create({
      data: { name, secretId },
    })

    // Create a new meeting for this room
    const meeting = await prisma.meeting.create({
      data: {
        roomId: room.id,
      },
    })

    return NextResponse.json({
      secretId: room.secretId,
      name: room.name,
      meetingId: meeting.id,
    })
  } catch (error) {
    console.error('Failed to create room:', error)
    return NextResponse.json(
      { error: 'Failed to create room' },
      { status: 500 }
    )
  }
}

// GET handler removed - no public room listing
