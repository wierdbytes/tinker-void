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

  return (
    <div className={cn('h-2 bg-gray-700 rounded-full overflow-hidden', className)}>
      <div
        className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75"
        style={{ width: `${level * 100}%` }}
      />
    </div>
  )
}
