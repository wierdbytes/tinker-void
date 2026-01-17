import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TranscriptionSource } from '@/generated/prisma/enums'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sourceParam = request.nextUrl.searchParams.get('source') as TranscriptionSource | null

    // Validate source parameter
    const validSources: TranscriptionSource[] = ['WHISPER', 'DEEPGRAM']
    const source = sourceParam && validSources.includes(sourceParam) ? sourceParam : null

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            // NOT selecting secretId - it must never be exposed
          },
        },
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
