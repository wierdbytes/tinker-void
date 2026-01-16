import { createClient, DeepgramClient } from '@deepgram/sdk'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'

interface Recording {
  id: string
  fileUrl: string
  duration: number
  startedAt: Date | null
  participantId: string
}

export interface TranscriptionSegment {
  text: string
  startTime: number
  endTime: number
}

// S3 client for MinIO
const s3Client = new S3Client({
  endpoint: `http://${process.env.MINIO_ENDPOINT || 'localhost:9000'}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
  },
  forcePathStyle: true,
})

const BUCKET = process.env.MINIO_BUCKET || 'recordings'

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * Download a file from MinIO by its key (fileUrl)
 */
async function downloadFromMinIO(fileUrl: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: fileUrl })
  const response = await s3Client.send(command)
  if (!response.Body) throw new Error('Empty response body from MinIO')
  return streamToBuffer(response.Body as Readable)
}

/**
 * Calculate offset in seconds for a recording relative to meeting start
 */
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

/**
 * Parse Deepgram response into transcript segments grouped by sentences
 */
function parseDeepgramResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
  offset: number
): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = []
  const channel = result?.results?.channels?.[0]
  const alternatives = channel?.alternatives?.[0]

  if (!alternatives) {
    return segments
  }

  // Use words with timestamps to build sentence-based segments
  const words = alternatives.words || []
  if (words.length === 0 && alternatives.transcript) {
    // No word-level timestamps, return full transcript as one segment
    return [
      {
        text: alternatives.transcript.trim(),
        startTime: offset,
        endTime: offset + (result.metadata?.duration || 0),
      },
    ]
  }

  // Group words into sentences (split on sentence-ending punctuation)
  let currentSentence: { text: string; start: number; end: number } | null = null

  for (const word of words) {
    const wordText = word.punctuated_word || word.word || ''
    const wordStart = word.start || 0
    const wordEnd = word.end || wordStart

    if (!currentSentence) {
      currentSentence = {
        text: wordText,
        start: wordStart,
        end: wordEnd,
      }
    } else {
      currentSentence.text += ' ' + wordText
      currentSentence.end = wordEnd
    }

    // Check if this word ends a sentence
    if (/[.!?]$/.test(wordText)) {
      segments.push({
        text: currentSentence.text.trim(),
        startTime: currentSentence.start + offset,
        endTime: currentSentence.end + offset,
      })
      currentSentence = null
    }
  }

  // Add remaining words as final segment
  if (currentSentence && currentSentence.text.trim()) {
    segments.push({
      text: currentSentence.text.trim(),
      startTime: currentSentence.start + offset,
      endTime: currentSentence.end + offset,
    })
  }

  return segments
}

let deepgramClient: DeepgramClient | null = null

function getDeepgramClient(): DeepgramClient {
  if (!deepgramClient) {
    const apiKey = process.env.DEEPGRAM_API_KEY
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY not configured')
    }
    deepgramClient = createClient(apiKey)
  }
  return deepgramClient
}

/**
 * Get configured language setting
 * 'multi' enables Multilingual Code Switching (auto-detects and transcribes multiple languages)
 * Specific language codes: 'ru', 'en', 'es', etc.
 */
function getLanguageSetting(): string {
  return process.env.DEEPGRAM_LANGUAGE || 'multi'
}

/**
 * Transcribe a recording using Deepgram API
 */
export async function transcribeWithDeepgram(
  recording: Recording,
  meetingStartedAt: Date
): Promise<TranscriptionSegment[]> {
  const deepgram = getDeepgramClient()
  const model = process.env.DEEPGRAM_MODEL || 'nova-3'
  const language = getLanguageSetting()

  // Download file from MinIO
  const audioBuffer = await downloadFromMinIO(recording.fileUrl)

  // Transcribe using Deepgram
  // language='multi' enables Multilingual Code Switching for mixed-language audio
  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
    model,
    language,
    punctuate: true,
    smart_format: true,
    mimetype: 'audio/ogg',
  })

  if (error) {
    throw new Error(`Deepgram API error: ${error.message}`)
  }

  // Calculate offset for synchronization with meeting start
  const offset = calculateRecordingOffset(recording.startedAt, recording.fileUrl, meetingStartedAt)

  // Parse response into segments
  return parseDeepgramResponse(result, offset)
}

/**
 * Check if Deepgram is configured and available
 */
export function isDeepgramConfigured(): boolean {
  return !!process.env.DEEPGRAM_API_KEY
}

/**
 * Get Deepgram model name
 */
export function getDeepgramModel(): string | null {
  if (!isDeepgramConfigured()) return null
  return process.env.DEEPGRAM_MODEL || 'nova-3'
}

/**
 * Get Deepgram language setting
 */
export function getDeepgramLanguage(): string | null {
  if (!isDeepgramConfigured()) return null
  return process.env.DEEPGRAM_LANGUAGE || 'multi'
}
