import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateAdminKey } from '@/lib/admin-auth'

export async function GET(request: NextRequest) {
  const auth = validateAdminKey(request)
  if (!auth.valid) return auth.error!

  try {
    const rooms = await prisma.room.findMany({
      include: {
        _count: { select: { meetings: true } },
        meetings: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { startedAt: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = rooms.map(room => ({
      id: room.id,
      name: room.name,
      secretId: room.secretId,
      createdAt: room.createdAt.toISOString(),
      meetingCount: room._count.meetings,
      lastMeeting: room.meetings[0] ? {
        startedAt: room.meetings[0].startedAt.toISOString(),
        status: room.meetings[0].status,
      } : null,
    }))

    return NextResponse.json(data)
  } catch (error) {
    console.error('Failed to fetch rooms:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rooms' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = validateAdminKey(request)
  if (!auth.valid) return auth.error!

  try {
    const { id } = await request.json()

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Room ID is required' },
        { status: 400 }
      )
    }

    await prisma.room.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete room:', error)
    return NextResponse.json(
      { error: 'Failed to delete room' },
      { status: 500 }
    )
  }
}
