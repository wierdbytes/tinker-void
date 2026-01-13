import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const roomId = searchParams.get('roomId')

    const where: any = {}

    if (status) {
      where.status = status
    }

    if (roomId) {
      where.roomId = roomId
    }

    const meetings = await prisma.meeting.findMany({
      where,
      include: {
        room: true,
        participants: true,
        _count: {
          select: {
            utterances: true,
            recordings: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })

    return NextResponse.json(meetings)
  } catch (error) {
    console.error('Failed to fetch meetings:', error)
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 })
  }
}
