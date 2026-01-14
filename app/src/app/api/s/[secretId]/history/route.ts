import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  try {
    const { secretId } = await params

    const room = await prisma.room.findUnique({
      where: { secretId },
      include: {
        meetings: {
          include: {
            participants: {
              select: {
                id: true,
                name: true,
                joinedAt: true,
                leftAt: true,
              },
            },
            _count: {
              select: {
                utterances: true,
                recordings: true,
              },
            },
          },
          orderBy: { startedAt: 'desc' },
        },
      },
    })

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        secretId: room.secretId,
      },
      meetings: room.meetings,
    })
  } catch (error) {
    console.error('Failed to fetch room history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch room history' },
      { status: 500 }
    )
  }
}
