import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isDeepgramConfigured, transcribeWithDeepgram, TranscriptionSegment } from '@/lib/deepgram'

interface TranscriptionResult {
  recordingId: string
  participantId: string
  participantName: string
  segmentsCount: number
}

/**
 * POST /api/transcribe/deepgram
 * Transcribe meeting recordings using Deepgram API
 *
 * Body: { meetingId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { meetingId } = await request.json()

    if (!meetingId) {
      return NextResponse.json(
        { error: 'meetingId is required' },
        { status: 400 }
      )
    }

    // Check if Deepgram is configured
    if (!isDeepgramConfigured()) {
      return NextResponse.json(
        { error: 'Deepgram API is not configured' },
        { status: 503 }
      )
    }

    // Get meeting with recordings
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        recordings: {
          where: { deepgramTranscribed: false },
          include: { participant: true },
        },
      },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Check if there are recordings to transcribe
    if (meeting.recordings.length === 0) {
      // Check if already transcribed
      const alreadyTranscribed = await prisma.recording.count({
        where: { meetingId, deepgramTranscribed: true },
      })

      if (alreadyTranscribed > 0) {
        return NextResponse.json({
          status: 'already_completed',
          message: 'All recordings have already been transcribed with Deepgram',
          totalUtterances: await prisma.utterance.count({
            where: { meetingId, source: 'DEEPGRAM' },
          }),
        })
      }

      return NextResponse.json({
        status: 'no_recordings',
        message: 'No recordings found for this meeting',
      })
    }

    console.log(
      `[Deepgram] Starting transcription for meeting ${meetingId}, ${meeting.recordings.length} recordings`
    )

    const results: TranscriptionResult[] = []
    let totalUtterances = 0

    // Process each recording
    for (const recording of meeting.recordings) {
      try {
        console.log(
          `[Deepgram] Transcribing recording ${recording.id} (${recording.participant.name})`
        )

        // Transcribe with Deepgram
        const segments: TranscriptionSegment[] = await transcribeWithDeepgram(
          {
            id: recording.id,
            fileUrl: recording.fileUrl,
            duration: recording.duration,
            startedAt: recording.startedAt,
            participantId: recording.participantId,
          },
          meeting.startedAt
        )

        // Save utterances with source = DEEPGRAM
        if (segments.length > 0) {
          await prisma.utterance.createMany({
            data: segments.map((segment) => ({
              meetingId: recording.meetingId,
              participantId: recording.participantId,
              text: segment.text,
              startTime: segment.startTime,
              endTime: segment.endTime,
              source: 'DEEPGRAM',
            })),
          })
          totalUtterances += segments.length
        }

        // Mark recording as transcribed by Deepgram
        await prisma.recording.update({
          where: { id: recording.id },
          data: { deepgramTranscribed: true },
        })

        results.push({
          recordingId: recording.id,
          participantId: recording.participantId,
          participantName: recording.participant.name,
          segmentsCount: segments.length,
        })

        console.log(
          `[Deepgram] Recording ${recording.id} transcribed: ${segments.length} segments`
        )
      } catch (error) {
        console.error(`[Deepgram] Error transcribing recording ${recording.id}:`, error)
        // Continue with other recordings
        results.push({
          recordingId: recording.id,
          participantId: recording.participantId,
          participantName: recording.participant.name,
          segmentsCount: 0,
        })
      }
    }

    console.log(
      `[Deepgram] Completed transcription for meeting ${meetingId}: ${totalUtterances} total utterances`
    )

    return NextResponse.json({
      status: 'completed',
      results,
      totalUtterances,
    })
  } catch (error) {
    console.error('[Deepgram] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 500 }
    )
  }
}
