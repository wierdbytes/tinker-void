import { NextRequest, NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '@/lib/prisma'
import { spawn } from 'child_process'
import { Readable } from 'stream'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { createReadStream } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

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

async function downloadFromS3(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  const response = await s3Client.send(command)
  if (!response.Body) throw new Error('Empty response body')
  return streamToBuffer(response.Body as Readable)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: meetingId } = await params

  try {
    // Get meeting with recordings
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            // NOT selecting secretId - it must never be exposed
          },
        },
        recordings: {
          include: { participant: true },
        },
      },
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    if (!meeting.recordings || meeting.recordings.length === 0) {
      return NextResponse.json({ error: 'No recordings found' }, { status: 404 })
    }

    // Create temp directory
    const tempDir = join(tmpdir(), `meeting-audio-${randomUUID()}`)
    await mkdir(tempDir, { recursive: true })

    const inputFiles: { path: string; offset: number; duration: number }[] = []

    // Download all recordings
    for (const rec of meeting.recordings) {
      const buffer = await downloadFromS3(rec.fileUrl)
      const filePath = join(tempDir, `${rec.id}.ogg`)
      await writeFile(filePath, buffer)

      // Calculate offset relative to meeting start
      let offset = 0
      if (rec.startedAt && meeting.startedAt) {
        offset = Math.max(0, (rec.startedAt.getTime() - meeting.startedAt.getTime()) / 1000)
      }

      inputFiles.push({ path: filePath, offset, duration: rec.duration })
    }

    // Calculate total duration
    const totalDuration = inputFiles.reduce((max, f) => Math.max(max, f.offset + f.duration), 0)

    // Build ffmpeg filter complex for mixing with delays
    const filterInputs = inputFiles.map((f, i) =>
      `[${i}]adelay=${Math.round(f.offset * 1000)}|${Math.round(f.offset * 1000)}[a${i}]`
    ).join(';')

    const mixInputs = inputFiles.map((_, i) => `[a${i}]`).join('')
    const filterComplex = `${filterInputs};${mixInputs}amix=inputs=${inputFiles.length}:duration=longest:normalize=0`

    const outputPath = join(tempDir, 'output.mp3')

    // Run ffmpeg
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y',
        ...inputFiles.flatMap(f => ['-i', f.path]),
        '-filter_complex', filterComplex,
        '-b:a', '128k',
        outputPath,
      ]

      const ffmpeg = spawn('ffmpeg', args)

      let stderr = ''
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
        }
      })

      ffmpeg.on('error', reject)
    })

    // Read output file
    const outputStream = createReadStream(outputPath)
    const outputBuffer = await streamToBuffer(outputStream)

    // Cleanup temp files
    for (const f of inputFiles) {
      await unlink(f.path).catch(() => {})
    }
    await unlink(outputPath).catch(() => {})

    // Generate filename
    const safeName = meeting.room.name.replace(/[^a-zA-Z0-9а-яА-Я\s-]/gi, '').replace(/\s+/g, '_')
    const date = meeting.startedAt.toISOString().split('T')[0]
    const filename = `${safeName}_${date}.mp3`

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': outputBuffer.length.toString(),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (error) {
    console.error('Error generating merged audio:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate audio' },
      { status: 500 }
    )
  }
}
