import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { summarizeMeeting, formatDialog, type DialogEntry } from '@/lib/claude'

export async function POST(request: NextRequest) {
  try {
    const { meetingId } = await request.json()

    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 })
    }

    // Get meeting with utterances and participants
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        room: true,
        utterances: {
          include: { participant: true },
          orderBy: { startTime: 'asc' },
        },
        participants: true,
      },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    if (meeting.utterances.length === 0) {
      // No utterances to summarize
      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          status: 'COMPLETED',
          summary: 'Встреча без записанных разговоров.',
        },
      })
      return NextResponse.json({ message: 'No utterances to summarize' })
    }

    // Format utterances as dialog
    const dialog: DialogEntry[] = meeting.utterances.map((utterance) => ({
      participantName: utterance.participant.name,
      text: utterance.text,
      startTime: utterance.startTime,
      endTime: utterance.endTime,
    }))

    // Generate summary using Claude
    const summary = await summarizeMeeting(dialog, meeting.room.name)

    // Generate formatted dialog
    const formattedTranscript = formatDialog(dialog)

    // Update meeting with summary
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'COMPLETED',
        summary: `${summary}\n\n---\n\n## Полный транскрипт\n\n${formattedTranscript}`,
      },
    })

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (error) {
    console.error('Summarization error:', error)

    // Mark meeting as failed
    try {
      const { meetingId } = await request.json()
      if (meetingId) {
        await prisma.meeting.update({
          where: { id: meetingId },
          data: { status: 'FAILED' },
        })
      }
    } catch {}

    return NextResponse.json({ error: 'Summarization failed' }, { status: 500 })
  }
}
