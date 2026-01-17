'use client'

import { useEffect, useRef } from 'react'
import { Video } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoPreviewProps {
  stream: MediaStream | null
  className?: string
  mirrored?: boolean
}

export function VideoPreview({
  stream,
  className,
  mirrored = true,
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  if (!stream) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-surface-secondary rounded-2xl border border-border/50',
          className
        )}
      >
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
            <Video className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Камера выключена</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl bg-black',
        className
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          'w-full h-full object-cover',
          mirrored && 'scale-x-[-1]'
        )}
      />
    </div>
  )
}
