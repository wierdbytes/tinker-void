'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface AudioLevelMeterProps {
  stream: MediaStream | null
  className?: string
}

export function AudioLevelMeter({ stream, className }: AudioLevelMeterProps) {
  const [level, setLevel] = useState(0)
  const animationRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!stream) {
      setLevel(0)
      return
    }

    const audioContext = new AudioContext()
    audioContextRef.current = audioContext

    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.5
    analyserRef.current = analyser

    const source = audioContext.createMediaStreamSource(stream)
    source.connect(analyser)

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray)
      const sum = dataArray.reduce((acc, val) => acc + val, 0)
      const avg = sum / dataArray.length
      const normalizedLevel = Math.min(avg / 128, 1)
      setLevel(normalizedLevel)
      animationRef.current = requestAnimationFrame(updateLevel)
    }

    updateLevel()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      source.disconnect()
      audioContext.close()
    }
  }, [stream])

  // Create segmented bars
  const segments = 20
  const activeSegments = Math.round(level * segments)

  return (
    <div className={cn('flex items-center gap-0.5 h-3', className)}>
      {Array.from({ length: segments }).map((_, i) => {
        const isActive = i < activeSegments
        const isHigh = i >= segments * 0.7
        const isMedium = i >= segments * 0.5 && i < segments * 0.7

        return (
          <div
            key={i}
            className={cn(
              'flex-1 h-full rounded-sm transition-all duration-75',
              isActive
                ? isHigh
                  ? 'bg-destructive'
                  : isMedium
                  ? 'bg-warning'
                  : 'bg-primary'
                : 'bg-surface-tertiary'
            )}
          />
        )
      })}
    </div>
  )
}
