import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateAdminKey } from '@/lib/admin-auth'
import { getRoomServiceClient } from '@/lib/livekit'

export async function GET(request: NextRequest) {
  const auth = validateAdminKey(request)
  if (!auth.valid) return auth.error!

  try {
    // Count rooms
    const totalRooms = await prisma.room.count()

    // Count meetings by status
    const meetingsByStatus = await prisma.meeting.groupBy({
      by: ['status'],
      _count: true,
    })

    const meetingStats = {
      total: 0,
      inProgress: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    }

    for (const m of meetingsByStatus) {
      meetingStats.total += m._count
      switch (m.status) {
        case 'IN_PROGRESS':
          meetingStats.inProgress = m._count
          break
        case 'PROCESSING':
          meetingStats.processing = m._count
          break
        case 'COMPLETED':
          meetingStats.completed = m._count
          break
        case 'FAILED':
          meetingStats.failed = m._count
          break
      }
    }

    // Count recordings
    const totalRecordings = await prisma.recording.count()
    const transcribedRecordings = await prisma.recording.count({
      where: { transcribed: true },
    })

    // Count utterances
    const totalUtterances = await prisma.utterance.count()

    // Count participants
    const totalParticipants = await prisma.participant.count()

    // Try to get live stats from LiveKit
    let liveStats = {
      activeRooms: 0,
      onlineParticipants: 0,
    }
    try {
      const roomService = getRoomServiceClient()
      const rooms = await roomService.listRooms()
      liveStats.activeRooms = rooms.length
      liveStats.onlineParticipants = rooms.reduce((sum, r) => sum + r.numParticipants, 0)
    } catch {
      // LiveKit may not be available
    }

    return NextResponse.json({
      rooms: {
        total: totalRooms,
      },
      meetings: meetingStats,
      recordings: {
        total: totalRecordings,
        transcribed: transcribedRecordings,
      },
      utterances: {
        total: totalUtterances,
      },
      participants: {
        total: totalParticipants,
      },
      live: liveStats,
    })
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
