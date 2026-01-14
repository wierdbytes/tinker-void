/**
 * RabbitMQ client for publishing transcription tasks.
 */

import amqplib, { Channel, ChannelModel } from 'amqplib'

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://tinkervoid:tinkervoid_secret@localhost:5672/'

// Queue configuration
const EXCHANGE_NAME = 'transcription'
const TASKS_ROUTING_KEY = 'transcription.task'

// Connection state
let connection: ChannelModel | null = null
let channel: Channel | null = null
let isConnecting = false

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
 * Connect to RabbitMQ and set up exchange.
 */
async function connect(): Promise<void> {
  if (connection && channel) {
    return
  }

  if (isConnecting) {
    // Wait for existing connection attempt
    await new Promise((resolve) => setTimeout(resolve, 100))
    return connect()
  }

  isConnecting = true

  try {
    console.log('[RabbitMQ] Connecting...')
    connection = await amqplib.connect(RABBITMQ_URL)
    channel = await connection.createChannel()

    // Declare exchange
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true })

    // Handle connection errors
    connection.on('error', (err) => {
      console.error('[RabbitMQ] Connection error:', err)
      connection = null
      channel = null
    })

    connection.on('close', () => {
      console.log('[RabbitMQ] Connection closed')
      connection = null
      channel = null
    })

    console.log('[RabbitMQ] Connected successfully')
  } catch (error) {
    console.error('[RabbitMQ] Failed to connect:', error)
    connection = null
    channel = null
    throw error
  } finally {
    isConnecting = false
  }
}

/**
 * Publish a transcription task to the queue.
 */
export async function publishTranscriptionTask(task: TranscriptionTask): Promise<void> {
  await connect()

  if (!channel) {
    throw new Error('RabbitMQ channel not available')
  }

  const message = Buffer.from(JSON.stringify(task))

  channel.publish(EXCHANGE_NAME, TASKS_ROUTING_KEY, message, {
    persistent: true,
    contentType: 'application/json',
  })

  console.log(`[RabbitMQ] Task published: task_id=${task.task_id} recording_id=${task.recording_id}`)
}

/**
 * Close RabbitMQ connection.
 */
export async function closeRabbitMQ(): Promise<void> {
  if (channel) {
    await channel.close()
    channel = null
  }
  if (connection) {
    await connection.close()
    connection = null
  }
  console.log('[RabbitMQ] Connection closed')
}

/**
 * Check if connected to RabbitMQ.
 */
export function isRabbitMQConnected(): boolean {
  return connection !== null && channel !== null
}
