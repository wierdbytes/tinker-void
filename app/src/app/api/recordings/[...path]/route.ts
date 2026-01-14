import { NextRequest, NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'

// S3/MinIO client configuration
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const filePath = path.join('/')

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 })
    }

    // Fetch from MinIO
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: filePath,
    })

    const response = await s3Client.send(command)

    if (!response.Body) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Convert the S3 body stream to a web-compatible ReadableStream
    const bodyStream = response.Body as Readable
    const webStream = new ReadableStream({
      start(controller) {
        bodyStream.on('data', (chunk) => {
          controller.enqueue(chunk)
        })
        bodyStream.on('end', () => {
          controller.close()
        })
        bodyStream.on('error', (err) => {
          controller.error(err)
        })
      },
    })

    // Determine content type based on file extension
    const ext = filePath.split('.').pop()?.toLowerCase()
    const contentType = ext === 'ogg' ? 'audio/ogg' :
                       ext === 'wav' ? 'audio/wav' :
                       ext === 'mp3' ? 'audio/mpeg' :
                       response.ContentType || 'application/octet-stream'

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': response.ContentLength?.toString() || '',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error fetching recording:', error)

    // Check if it's a "not found" error
    if ((error as { name?: string }).name === 'NoSuchKey') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    return NextResponse.json(
      { error: 'Failed to fetch recording' },
      { status: 500 }
    )
  }
}
