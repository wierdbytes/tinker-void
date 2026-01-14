import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const TRANSCRIBER_URL = process.env.TRANSCRIBER_URL || 'http://localhost:8001'

// Calculate offset in seconds for a recording relative to meeting start
// Uses recording.startedAt (from LiveKit Egress) for accurate timing
// Falls back to parsing timestamp from filename if startedAt is not available
function calculateRecordingOffset(
  recordingStartedAt: Date | null,
  fileUrl: string,
  meetingStartedAt: Date
): number {
  let recordingStartMs: number

  if (recordingStartedAt) {
    // Use accurate startedAt from LiveKit Egress
    recordingStartMs = recordingStartedAt.getTime()
  } else {
    // Fallback: extract timestamp from file URL (less accurate, has ~15s delay)
    const filename = fileUrl.split('/').pop() || ''
    const match = filename.match(/_(\d+)\.ogg$/)
    recordingStartMs = match ? parseInt(match[1], 10) : 0
  }

  const meetingStartMs = meetingStartedAt.getTime()
  return Math.max(0, (recordingStartMs - meetingStartMs) / 1000)
}

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
      return NextResponse.json({ message: 'No recordings to transcribe' })
    }

    // Transcribe each recording
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const transcriptionPromises = meeting.recordings.map(async (recording) => {
      try {
        // Send relative path - transcriber has its own MinIO connection
        console.log(`Transcribing recording ${recording.id}: ${recording.fileUrl}`)

        const response = await fetch(`${TRANSCRIBER_URL}/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_url: recording.fileUrl,
            recording_id: recording.id,
            callback_url: `${baseUrl}/api/transcribe/callback`,
          }),
        })

        if (!response.ok) {
          throw new Error(`Transcription failed: ${response.statusText}`)
        }

        const result = await response.json()

        // Calculate offset for this recording relative to meeting start
        const offset = calculateRecordingOffset(recording.startedAt, recording.fileUrl, meeting.startedAt)
        console.log(`Recording ${recording.id} offset: ${offset}s (startedAt: ${recording.startedAt})`)

        // Save utterances from transcription (with offset added to times)
        if (result.segments && result.segments.length > 0) {
          await prisma.utterance.createMany({
            data: result.segments.map((segment: any) => ({
              meetingId: meeting.id,
              participantId: recording.participantId,
              text: segment.text,
              startTime: segment.start + offset,
              endTime: segment.end + offset,
            })),
          })
        } else if (result.text) {
          // Single utterance if no segments
          await prisma.utterance.create({
            data: {
              meetingId: meeting.id,
              participantId: recording.participantId,
              text: result.text,
              startTime: offset,
              endTime: (result.duration || 0) + offset,
            },
          })
        }

        // Mark recording as transcribed
        await prisma.recording.update({
          where: { id: recording.id },
          data: { transcribed: true },
        })

        return { recordingId: recording.id, success: true }
      } catch (error) {
        console.error(`Failed to transcribe recording ${recording.id}:`, error)
        return { recordingId: recording.id, success: false, error: String(error) }
      }
    })

    const results = await Promise.all(transcriptionPromises)

    // Mark meeting as completed
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: 'COMPLETED' },
    })

    return NextResponse.json({
      message: 'Transcription completed',
      results,
    })
  } catch (error) {
    console.error('Transcription error:', error)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}

// Callback endpoint for async transcription results
export async function PUT(request: NextRequest) {
  try {
    const { recording_id, text, segments, duration } = await request.json()

    if (!recording_id) {
      return NextResponse.json({ error: 'Recording ID is required' }, { status: 400 })
    }

    // Get recording with meeting for offset calculation
    const recording = await prisma.recording.findUnique({
      where: { id: recording_id },
      include: { meeting: true },
    })

    if (!recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    // Calculate offset for this recording relative to meeting start
    const offset = calculateRecordingOffset(recording.startedAt, recording.fileUrl, recording.meeting.startedAt)
    console.log(`Recording ${recording.id} offset (callback): ${offset}s (startedAt: ${recording.startedAt})`)

    // Save utterances (with offset added to times)
    if (segments && segments.length > 0) {
      await prisma.utterance.createMany({
        data: segments.map((segment: any) => ({
          meetingId: recording.meetingId,
          participantId: recording.participantId,
          text: segment.text,
          startTime: segment.start + offset,
          endTime: segment.end + offset,
        })),
      })
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
    }

    // Mark as transcribed
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

    if (pendingRecordings === 0) {
      // All done, mark meeting as completed
      await prisma.meeting.update({
        where: { id: recording.meetingId },
        data: { status: 'COMPLETED' },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 })
  }
}
