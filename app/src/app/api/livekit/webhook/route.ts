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

  // LiveKit track types: 0 = AUDIO, 1 = VIDEO
  // LiveKit track sources: 0 = UNKNOWN, 1 = CAMERA, 2 = MICROPHONE, 3 = SCREEN_SHARE, 4 = SCREEN_SHARE_AUDIO
  const trackSource = track.source
  const trackType = track.type

  console.log(`Track published event - type: ${trackType}, source: ${trackSource}, sid: ${track.sid}, participant: ${participant.identity}`)

  // Only record microphone audio tracks (type=0/AUDIO, source=2/MICROPHONE)
  const isAudio = trackType === 0 || trackType === 'AUDIO'
  const isMicrophone = trackSource === 2 || trackSource === 'MICROPHONE'

  if (!isAudio || !isMicrophone) {
    console.log(`Skipping track: type=${trackType}, source=${trackSource} (not microphone audio)`)
    return
  }

  const roomName = room.name
  const trackSid = track.sid
  const participantIdentity = participant.identity

  console.log(`Audio track published: ${trackSid} by ${participantIdentity} in room ${roomName}`)

  // Find meeting and participant
  const dbRoom = await prisma.room.findUnique({
    where: { id: roomName },
    include: {
      meetings: {
        where: { status: 'IN_PROGRESS' },
        orderBy: { startedAt: 'desc' },
        take: 1,
        include: { participants: true },
      },
    },
  })

  if (!dbRoom || !dbRoom.meetings[0]) {
    console.log('No active meeting found for track recording')
    return
  }

  const meeting = dbRoom.meetings[0]
  const dbParticipant = meeting.participants.find((p: { identity: string }) => p.identity === participantIdentity)

  if (!dbParticipant) {
    console.log(`Participant ${participantIdentity} not found in meeting`)
    return
  }

  try {
    const egress = await startTrackRecording(roomName, trackSid, participantIdentity)

    // Save egress to DB for tracking
    await prisma.egress.create({
      data: {
        egressId: egress.egressId,
        meetingId: meeting.id,
        participantId: dbParticipant.id,
        trackSid: trackSid,
        status: 'ACTIVE',
      },
    })

    console.log(`Recording started for track ${trackSid}, egressId: ${egress.egressId}`)
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

  // Check if there are any active egresses still pending
  const activeEgresses = await prisma.egress.count({
    where: {
      meetingId: meeting.id,
      status: 'ACTIVE',
    },
  })

  if (activeEgresses === 0) {
    // All egresses already completed, trigger transcription immediately
    console.log(`No active egresses, triggering transcription immediately`)
    triggerPostProcessing(meeting.id)
  } else {
    // Wait for egress_ended webhooks to complete
    console.log(`Waiting for ${activeEgresses} egress(es) to complete before transcription`)
  }
}

async function handleEgressEnded(event: any) {
  console.log('handleEgressEnded - full event:', JSON.stringify(event, null, 2))

  const { egressInfo } = event
  if (!egressInfo) {
    console.log('No egressInfo in event')
    return
  }

  const livekitEgressId = egressInfo.egressId
  if (!livekitEgressId) {
    console.log('No egressId in egressInfo')
    return
  }

  console.log(`Egress ended: ${livekitEgressId}`)

  // Find egress record by LiveKit egressId
  const egress = await prisma.egress.findUnique({
    where: { egressId: livekitEgressId },
    include: {
      meeting: true,
      participant: true,
    },
  })

  if (!egress) {
    console.log(`Egress not found in DB: ${livekitEgressId}`)
    return
  }

  // Process file results
  const fileResults = egressInfo.fileResults || []

  // Get real recording start time from egressInfo (nanoseconds since epoch)
  const startedAtNs = egressInfo.startedAt || 0n
  const startedAtMs = Number(startedAtNs) / 1_000_000
  const recordingStartedAt = startedAtMs > 0 ? new Date(startedAtMs) : null

  console.log(`Egress startedAt: ${startedAtNs} ns = ${startedAtMs} ms = ${recordingStartedAt}`)

  for (const file of fileResults) {
    const filename = file.filename || file.filepath || ''
    const fileUrl = file.filepath || file.filename || ''
    const durationNs = file.duration || 0n
    const durationSec = Number(durationNs) / 1_000_000_000

    console.log(`Creating recording: meetingId=${egress.meetingId}, participantId=${egress.participantId}, fileUrl=${fileUrl}, duration=${durationSec}s, startedAt=${recordingStartedAt}`)

    await prisma.recording.create({
      data: {
        meetingId: egress.meetingId,
        participantId: egress.participantId,
        fileUrl: fileUrl,
        fileName: filename,
        duration: durationSec,
        startedAt: recordingStartedAt,
      },
    })

    console.log(`Recording saved for participant ${egress.participant.name}`)
  }

  // Mark egress as completed
  await prisma.egress.update({
    where: { id: egress.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })

  // Check if all egresses for this meeting are completed
  const activeEgresses = await prisma.egress.count({
    where: {
      meetingId: egress.meetingId,
      status: 'ACTIVE',
    },
  })

  console.log(`Active egresses remaining for meeting ${egress.meetingId}: ${activeEgresses}`)

  // If meeting is in PROCESSING state and all egresses are done, trigger transcription
  if (egress.meeting.status === 'PROCESSING' && activeEgresses === 0) {
    console.log(`All egresses completed, triggering transcription for meeting ${egress.meetingId}`)
    triggerPostProcessing(egress.meetingId)
  }
}

async function triggerPostProcessing(meetingId: string) {
  try {
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
