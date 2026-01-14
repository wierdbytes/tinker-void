import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { publishTranscriptionTask, TranscriptionTask } from '@/lib/rabbitmq'
import { randomUUID } from 'crypto'

/**
 * Queue transcription tasks for a meeting.
 * Publishes tasks to RabbitMQ, results come via callback.
 */
export async function POST(request: NextRequest) {
  try {
    const { meetingId } = await request.json()

    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 })
    }

    // Get meeting with recordings
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        recordings: {
          where: { transcribed: false },
          include: { participant: true },
        },
        participants: true,
      },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    if (meeting.recordings.length === 0) {
      // No recordings to transcribe, mark as completed
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: 'COMPLETED' },
      })
      return NextResponse.json({ message: 'No recordings to transcribe', count: 0 })
    }

    // Publish tasks to RabbitMQ
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const tasks: TranscriptionTask[] = []

    for (const recording of meeting.recordings) {
      const task: TranscriptionTask = {
        task_id: randomUUID(),
        recording_id: recording.id,
        meeting_id: meetingId,
        participant_id: recording.participantId,
        file_url: recording.fileUrl,
        recording_started_at: recording.startedAt?.toISOString() || null,
        meeting_started_at: meeting.startedAt.toISOString(),
        callback_url: `${baseUrl}/api/transcribe/callback`,
        retry_count: 0,
      }

      await publishTranscriptionTask(task)
      tasks.push(task)

      console.log(`[Transcribe] Task queued: recording_id=${recording.id} task_id=${task.task_id}`)
    }

    return NextResponse.json({
      status: 'queued',
      count: tasks.length,
      tasks: tasks.map((t) => ({ task_id: t.task_id, recording_id: t.recording_id })),
    })
  } catch (error) {
    console.error('Transcription queue error:', error)
    return NextResponse.json({ error: 'Failed to queue transcription' }, { status: 500 })
  }
}

