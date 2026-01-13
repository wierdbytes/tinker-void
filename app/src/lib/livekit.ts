import { AccessToken, RoomServiceClient, EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk'

const apiKey = process.env.LIVEKIT_API_KEY!
const apiSecret = process.env.LIVEKIT_API_SECRET!
const livekitHost = process.env.LIVEKIT_URL || 'http://localhost:7880'

// MinIO/S3 configuration for Egress (uses Docker internal network)
// Note: Egress runs inside Docker, so it needs to reach MinIO via internal hostname
const s3Config = {
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secret: process.env.MINIO_SECRET_KEY || 'minioadmin123',
  region: 'us-east-1',
  endpoint: process.env.MINIO_EGRESS_ENDPOINT || 'http://minio:9000', // Internal Docker endpoint for Egress
  bucket: process.env.MINIO_BUCKET || 'recordings',
  forcePathStyle: true,
}

export function createToken(roomName: string, participantName: string, participantIdentity: string) {
  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: '24h',
  })

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  return at.toJwt()
}

export function getRoomServiceClient() {
  return new RoomServiceClient(livekitHost.replace('ws://', 'http://').replace('wss://', 'https://'), apiKey, apiSecret)
}

export function getEgressClient() {
  return new EgressClient(livekitHost.replace('ws://', 'http://').replace('wss://', 'https://'), apiKey, apiSecret)
}

export async function startTrackRecording(roomName: string, trackSid: string, participantIdentity: string) {
  const egressClient = getEgressClient()

  try {
    const timestamp = Date.now()
    const filepath = `${roomName}/${participantIdentity}_${timestamp}.ogg`

    const s3Upload = new S3Upload({
      accessKey: s3Config.accessKey,
      secret: s3Config.secret,
      region: s3Config.region,
      endpoint: s3Config.endpoint,
      bucket: s3Config.bucket,
      forcePathStyle: s3Config.forcePathStyle,
    })

    const output = new EncodedFileOutput({
      fileType: EncodedFileType.OGG,
      filepath: filepath,
      output: {
        case: 's3',
        value: s3Upload,
      },
    })

    const egress = await egressClient.startTrackEgress(roomName, output, trackSid)
    console.log(`Started recording for ${participantIdentity} in room ${roomName}, egressId: ${egress.egressId}`)

    return egress
  } catch (error) {
    console.error('Failed to start track recording:', error)
    throw error
  }
}
