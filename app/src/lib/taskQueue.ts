/**
 * Redis Streams client for publishing transcription tasks.
 */

import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const STREAM_NAME = 'transcription:tasks'
const STREAM_MAXLEN = 1000

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 2000)
      },
    })

    redis.on('error', (err) => {
      console.error('[TaskQueue] Redis error:', err.message)
    })

    redis.on('connect', () => {
      console.log('[TaskQueue] Connected to Redis')
    })
  }
  return redis
}

/**
 * Task message format for transcription queue.
 */
export interface TranscriptionTask {
  task_id: string
  recording_id: string
  meeting_id: string
  participant_id: string
  file_url: string
  recording_started_at: string | null
  meeting_started_at: string
  callback_url: string
  retry_count: number
}

/**
 * Publish a transcription task to the Redis stream.
 */
export async function publishTranscriptionTask(task: TranscriptionTask): Promise<string> {
  const client = getRedis()
  const messageId = await client.xadd(
    STREAM_NAME,
    'MAXLEN',
    '~',
    String(STREAM_MAXLEN),
    '*',
    'data',
    JSON.stringify(task)
  )

  console.log(
    `[TaskQueue] Task published: task_id=${task.task_id} recording_id=${task.recording_id} message_id=${messageId}`
  )

  return messageId as string
}
