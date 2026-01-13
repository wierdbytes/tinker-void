import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const TRANSCRIBER_URL = process.env.TRANSCRIBER_URL || 'http://localhost:8001'
// MinIO endpoint for transcriber (inside Docker network)
const MINIO_INTERNAL_URL = process.env.MINIO_INTERNAL_URL || 'http://minio:9000'
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'recordings'

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
      // No recordings to transcribe, go straight to summarization
      await triggerSummarization(meetingId)
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

        // Save utterances from transcription
        if (result.segments && result.segments.length > 0) {
          await prisma.utterance.createMany({
            data: result.segments.map((segment: any) => ({
              meetingId: meeting.id,
              participantId: recording.participantId,
              text: segment.text,
              startTime: segment.start,
              endTime: segment.end,
            })),
          })
        } else if (result.text) {
          // Single utterance if no segments
          await prisma.utterance.create({
            data: {
              meetingId: meeting.id,
              participantId: recording.participantId,
              text: result.text,
              startTime: 0,
              endTime: result.duration || 0,
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

    // Trigger summarization after all transcriptions complete
    await triggerSummarization(meetingId)

    return NextResponse.json({
      message: 'Transcription completed',
      results,
    })
  } catch (error) {
    console.error('Transcription error:', error)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}

async function triggerSummarization(meetingId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    await fetch(`${baseUrl}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    })
  } catch (error) {
    console.error('Failed to trigger summarization:', error)
  }
}

// Callback endpoint for async transcription results
export async function PUT(request: NextRequest) {
  try {
    const { recording_id, text, segments, duration } = await request.json()

    if (!recording_id) {
      return NextResponse.json({ error: 'Recording ID is required' }, { status: 400 })
    }

    // Get recording
    const recording = await prisma.recording.findUnique({
      where: { id: recording_id },
      include: { meeting: true },
    })

    if (!recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    // Save utterances
    if (segments && segments.length > 0) {
      await prisma.utterance.createMany({
        data: segments.map((segment: any) => ({
          meetingId: recording.meetingId,
          participantId: recording.participantId,
          text: segment.text,
          startTime: segment.start,
          endTime: segment.end,
        })),
      })
    } else if (text) {
      await prisma.utterance.create({
        data: {
          meetingId: recording.meetingId,
          participantId: recording.participantId,
          text,
          startTime: 0,
          endTime: duration || 0,
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
      // All done, trigger summarization
      await triggerSummarization(recording.meetingId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 })
  }
}
