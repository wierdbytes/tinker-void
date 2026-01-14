import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Calculate offset in seconds for a recording relative to meeting start
function calculateRecordingOffset(
  recordingStartedAt: Date | null,
  fileUrl: string,
  meetingStartedAt: Date
): number {
  let recordingStartMs: number

  if (recordingStartedAt) {
    recordingStartMs = recordingStartedAt.getTime()
  } else {
    // Fallback: extract timestamp from file URL
    const filename = fileUrl.split('/').pop() || ''
    const match = filename.match(/_(\d+)\.ogg$/)
    recordingStartMs = match ? parseInt(match[1], 10) : 0
  }

  const meetingStartMs = meetingStartedAt.getTime()
  return Math.max(0, (recordingStartMs - meetingStartMs) / 1000)
}

interface TranscriptionSegment {
  start: number
  end: number
  text: string
}

interface TranscriptionResult {
  task_id: string
  recording_id: string
  meeting_id: string
  participant_id?: string
  status: 'completed' | 'failed'
  text?: string
  segments?: TranscriptionSegment[]
  duration?: number
  error?: string
}

/**
 * Callback endpoint for transcription results from RabbitMQ consumer.
 */
export async function POST(request: NextRequest) {
  try {
    const result: TranscriptionResult = await request.json()

    const { recording_id, status, text, segments, duration, error } = result

    if (!recording_id) {
      return NextResponse.json({ error: 'Recording ID is required' }, { status: 400 })
    }

    console.log(
      `[Callback] Received: recording_id=${recording_id} status=${status} task_id=${result.task_id}`
    )

    // Get recording with meeting for offset calculation
    const recording = await prisma.recording.findUnique({
      where: { id: recording_id },
      include: { meeting: true },
    })

    if (!recording) {
      console.error(`[Callback] Recording not found: ${recording_id}`)
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    if (status === 'failed') {
      console.error(`[Callback] Transcription failed for ${recording_id}: ${error}`)
      // Mark recording as processed but failed (we don't retry from here)
      // The DLQ in RabbitMQ handles retry tracking
      return NextResponse.json({ success: true, status: 'failed' })
    }

    // Calculate offset for this recording relative to meeting start
    const offset = calculateRecordingOffset(
      recording.startedAt,
      recording.fileUrl,
      recording.meeting.startedAt
    )
    console.log(`[Callback] Recording ${recording.id} offset: ${offset}s`)

    // Save utterances (with offset added to times)
    if (segments && segments.length > 0) {
      await prisma.utterance.createMany({
        data: segments.map((segment) => ({
          meetingId: recording.meetingId,
          participantId: recording.participantId,
          text: segment.text,
          startTime: segment.start + offset,
          endTime: segment.end + offset,
        })),
      })
      console.log(`[Callback] Saved ${segments.length} utterances for recording ${recording_id}`)
    } else if (text) {
      await prisma.utterance.create({
        data: {
          meetingId: recording.meetingId,
          participantId: recording.participantId,
          text,
          startTime: offset,
          endTime: (duration || 0) + offset,
        },
      })
      console.log(`[Callback] Saved 1 utterance for recording ${recording_id}`)
    }

    // Mark recording as transcribed
    await prisma.recording.update({
      where: { id: recording_id },
      data: { transcribed: true },
    })

    // Check if all recordings are transcribed
    const pendingRecordings = await prisma.recording.count({
      where: {
        meetingId: recording.meetingId,
        transcribed: false,
      },
    })

    console.log(`[Callback] Pending recordings for meeting ${recording.meetingId}: ${pendingRecordings}`)

    if (pendingRecordings === 0) {
      // All done, mark meeting as completed and trigger summarization
      await prisma.meeting.update({
        where: { id: recording.meetingId },
        data: { status: 'COMPLETED' },
      })
      console.log(`[Callback] Meeting ${recording.meetingId} marked as COMPLETED`)

      // Trigger summarization (fire and forget)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: recording.meetingId }),
      }).catch((err) => {
        console.error(`[Callback] Failed to trigger summarization: ${err}`)
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Callback] Error:', error)
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 })
  }
}
