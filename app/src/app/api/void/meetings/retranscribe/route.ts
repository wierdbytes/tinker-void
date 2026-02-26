import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateAdminKey } from '@/lib/admin-auth'
import { publishTranscriptionTask, TranscriptionTask } from '@/lib/taskQueue'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const auth = validateAdminKey(request)
  if (!auth.valid) return auth.error!

  try {
    const { id } = await request.json()

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Meeting ID is required' },
        { status: 400 }
      )
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: { recordings: true },
    })

    if (!meeting) {
      return NextResponse.json(
        { error: 'Meeting not found' },
        { status: 404 }
      )
    }

    // 1. Delete all utterances (WHISPER + DEEPGRAM)
    await prisma.utterance.deleteMany({
      where: { meetingId: id },
    })

    // 2. Reset recordings transcribed flags
    await prisma.recording.updateMany({
      where: { meetingId: id },
      data: { transcribed: false, deepgramTranscribed: false },
    })

    // 3. Set meeting status to PROCESSING
    await prisma.meeting.update({
      where: { id },
      data: { status: 'PROCESSING' },
    })

    // 4. Re-query untranscribed recordings and publish tasks
    const recordings = await prisma.recording.findMany({
      where: { meetingId: id, transcribed: false },
      include: { participant: true },
    })

    if (recordings.length === 0) {
      await prisma.meeting.update({
        where: { id },
        data: { status: 'COMPLETED' },
      })
      return NextResponse.json({ success: true, count: 0 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    for (const recording of recordings) {
      const task: TranscriptionTask = {
        task_id: randomUUID(),
        recording_id: recording.id,
        meeting_id: id,
        participant_id: recording.participantId,
        file_url: recording.fileUrl,
        recording_started_at: recording.startedAt?.toISOString() || null,
        meeting_started_at: meeting.startedAt.toISOString(),
        callback_url: `${baseUrl}/api/transcribe/callback`,
        retry_count: 0,
      }

      await publishTranscriptionTask(task)
      console.log(`[Retranscribe] Task queued: recording_id=${recording.id} task_id=${task.task_id}`)
    }

    return NextResponse.json({ success: true, count: recordings.length })
  } catch (error) {
    console.error('Failed to retranscribe meeting:', error)
    return NextResponse.json(
      { error: 'Failed to retranscribe meeting' },
      { status: 500 }
    )
  }
}
