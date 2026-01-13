import { NextRequest, NextResponse } from 'next/server'
import { WebhookReceiver } from 'livekit-server-sdk'
import { prisma } from '@/lib/prisma'
import { startTrackRecording } from '@/lib/livekit'

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const authHeader = request.headers.get('Authorization')

    if (!authHeader) {
      return NextResponse.json({ error: 'Missing authorization' }, { status: 401 })
    }

    const event = await receiver.receive(body, authHeader)

    console.log('LiveKit webhook event:', event.event, event)

    switch (event.event) {
      case 'participant_joined':
        await handleParticipantJoined(event)
        break

      case 'participant_left':
        await handleParticipantLeft(event)
        break

      case 'track_published':
        await handleTrackPublished(event)
        break

      case 'room_finished':
        await handleRoomFinished(event)
        break

      case 'egress_ended':
        await handleEgressEnded(event)
        break

      default:
        console.log('Unhandled event:', event.event)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleParticipantJoined(event: any) {
  const { room, participant } = event
  if (!room || !participant) return

  const roomId = room.name
  const identity = participant.identity

  // Find or create meeting
  const dbRoom = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      meetings: {
        where: { status: 'IN_PROGRESS' },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!dbRoom) {
    console.log('Room not found in database:', roomId)
    return
  }

  const meeting = dbRoom.meetings[0]
  if (!meeting) {
    console.log('No active meeting for room:', roomId)
    return
  }

  // Update participant joinedAt if exists
  await prisma.participant.updateMany({
    where: {
      meetingId: meeting.id,
      identity,
    },
    data: {
      joinedAt: new Date(),
    },
  })

  console.log(`Participant ${participant.name} joined room ${roomId}`)
}

async function handleTrackPublished(event: any) {
  const { room, participant, track } = event
  if (!room || !participant || !track) return

  console.log(`Track published event - type: ${track.type}, sid: ${track.sid}, participant: ${participant.identity}`)

  // Only record audio tracks (type can be 0/'AUDIO' or string 'AUDIO')
  const isAudio = track.type === 0 || track.type === 'AUDIO'
  if (!isAudio) {
    console.log(`Skipping non-audio track: ${track.type}`)
    return
  }

  const roomName = room.name
  const trackSid = track.sid
  const participantIdentity = participant.identity

  console.log(`Audio track published: ${trackSid} by ${participantIdentity} in room ${roomName}`)

  try {
    await startTrackRecording(roomName, trackSid, participantIdentity)
    console.log(`Recording started for track ${trackSid}`)
  } catch (error) {
    console.error(`Failed to start recording for track ${trackSid}:`, error)
  }
}

async function handleParticipantLeft(event: any) {
  const { room, participant } = event
  if (!room || !participant) return

  const roomId = room.name
  const identity = participant.identity

  // Find the meeting
  const dbRoom = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      meetings: {
        where: { status: 'IN_PROGRESS' },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!dbRoom) return

  const meeting = dbRoom.meetings[0]
  if (!meeting) return

  // Update participant leftAt
  await prisma.participant.updateMany({
    where: {
      meetingId: meeting.id,
      identity,
    },
    data: {
      leftAt: new Date(),
    },
  })

  console.log(`Participant ${participant.name} left room ${roomId}`)
}

async function handleRoomFinished(event: any) {
  const { room } = event
  if (!room) return

  const roomId = room.name

  // Find the meeting
  const dbRoom = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      meetings: {
        where: { status: 'IN_PROGRESS' },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!dbRoom) return

  const meeting = dbRoom.meetings[0]
  if (!meeting) return

  // Update meeting status to PROCESSING
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      status: 'PROCESSING',
      endedAt: new Date(),
    },
  })

  console.log(`Room ${roomId} finished, meeting ${meeting.id} moved to PROCESSING`)

  // Trigger transcription and summarization (async)
  triggerPostProcessing(meeting.id)
}

async function handleEgressEnded(event: any) {
  console.log('handleEgressEnded - full event:', JSON.stringify(event, null, 2))

  const { egressInfo } = event
  if (!egressInfo) {
    console.log('No egressInfo in event')
    return
  }

  console.log('egressInfo:', JSON.stringify(egressInfo, null, 2))

  const roomName = egressInfo.roomName
  const fileResults = egressInfo.fileResults || []
  const file = fileResults[0] // First file result

  if (!file) {
    console.log('No file in egressInfo.fileResults')
    return
  }

  console.log(`Egress ended for room ${roomName}, file:`, JSON.stringify(file, null, 2))

  // Find the meeting
  const dbRoom = await prisma.room.findUnique({
    where: { id: roomName },
    include: {
      meetings: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        include: {
          participants: true,
        },
      },
    },
  })

  if (!dbRoom) return

  const meeting = dbRoom.meetings[0]
  if (!meeting) return

  // Try to extract participant identity from filename
  const filename = file.filename || file.filepath || ''
  console.log(`Looking for participant in filename: ${filename}`)
  console.log(`Meeting participants:`, meeting.participants.map(p => ({ id: p.id, identity: p.identity, name: p.name })))

  const participant = meeting.participants.find(p => filename.includes(p.identity))

  if (participant) {
    const fileUrl = file.filepath || file.filename || ''
    // Duration comes as BigInt in nanoseconds, convert to seconds as Float
    const durationNs = file.duration || 0n
    const durationSec = Number(durationNs) / 1_000_000_000

    console.log(`Creating recording: meetingId=${meeting.id}, participantId=${participant.id}, fileUrl=${fileUrl}, duration=${durationSec}s`)

    await prisma.recording.create({
      data: {
        meetingId: meeting.id,
        participantId: participant.id,
        fileUrl: fileUrl,
        fileName: filename,
        duration: durationSec,
      },
    })

    console.log(`Recording saved for participant ${participant.name}`)
  } else {
    console.log(`No matching participant found for filename: ${filename}`)
  }
}

async function triggerPostProcessing(meetingId: string) {
  try {
    // Call transcription API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    await fetch(`${baseUrl}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    })

    console.log(`Post-processing triggered for meeting ${meetingId}`)
  } catch (error) {
    console.error('Failed to trigger post-processing:', error)
  }
}
