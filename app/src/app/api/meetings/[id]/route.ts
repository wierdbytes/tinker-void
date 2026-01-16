import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TranscriptionSource } from '@/generated/prisma/enums'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const secretId = request.nextUrl.searchParams.get('secretId')
    const sourceParam = request.nextUrl.searchParams.get('source') as TranscriptionSource | null

    if (!secretId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate source parameter
    const validSources: TranscriptionSource[] = ['WHISPER', 'DEEPGRAM']
    const source = sourceParam && validSources.includes(sourceParam) ? sourceParam : null

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        room: true,
        participants: true,
        utterances: {
          where: source ? { source } : undefined,
          include: { participant: true },
          orderBy: { startTime: 'asc' },
        },
        recordings: {
          include: { participant: true },
        },
      },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Verify secretId matches the room
    if (meeting.room.secretId !== secretId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get available transcription sources for this meeting
    const availableSources = await prisma.utterance.groupBy({
      by: ['source'],
      where: { meetingId: id },
      _count: { id: true },
    })

    return NextResponse.json({
      ...meeting,
      availableSources: availableSources.map((s) => ({
        source: s.source,
        count: s._count.id,
      })),
    })
  } catch (error) {
    console.error('Failed to fetch meeting:', error)
    return NextResponse.json({ error: 'Failed to fetch meeting' }, { status: 500 })
  }
}
