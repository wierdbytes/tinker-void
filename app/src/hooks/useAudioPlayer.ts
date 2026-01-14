'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Recording {
  id: string
  fileUrl: string
  duration: number
  startedAt: string | null  // When the recording actually started (from LiveKit Egress)
  participant: {
    id: string
    name: string
    identity: string
  }
}

export interface TrackState {
  id: string
  muted: boolean
  volume: number
  loaded: boolean
  error: string | null
  offset: number
  duration: number
  participant: {
    id: string
    name: string
  }
}

export interface PlayerState {
  isPlaying: boolean
  isLoading: boolean
  currentTime: number
  totalDuration: number
}

export interface AudioPlayerReturn extends PlayerState {
  tracks: TrackState[]
  play: () => void
  pause: () => void
  seek: (time: number) => void
  seekAndPlay: (time: number) => void
  toggleMute: (trackId: string) => void
  setVolume: (trackId: string, volume: number) => void
}

// Use API route to proxy recordings from MinIO (works in all environments)
// Can be overridden with NEXT_PUBLIC_MINIO_URL for direct MinIO access in development
const RECORDINGS_BASE_URL = process.env.NEXT_PUBLIC_MINIO_URL || '/api/recordings'

// Calculate offset in seconds for a recording relative to meeting start
// Uses recording.startedAt (from LiveKit Egress) for accurate timing
// Falls back to parsing timestamp from filename if startedAt is not available
function calculateRecordingOffset(
  recordingStartedAt: string | null,
  fileUrl: string,
  meetingStartedAt: string
): number {
  let recordingStartMs: number

  if (recordingStartedAt) {
    // Use accurate startedAt from LiveKit Egress
    recordingStartMs = new Date(recordingStartedAt).getTime()
  } else {
    // Fallback: extract timestamp from file URL (less accurate, has ~15s delay)
    const filename = fileUrl.split('/').pop() || ''
    const match = filename.match(/_(\d+)\.ogg$/)
    recordingStartMs = match ? parseInt(match[1], 10) : 0
  }

  const meetingStartMs = new Date(meetingStartedAt).getTime()
  return Math.max(0, (recordingStartMs - meetingStartMs) / 1000)
}

export function useAudioPlayer(
  recordings: Recording[] | undefined,
  meetingStartedAt: string | undefined
): AudioPlayerReturn {
  const audioContextRef = useRef<AudioContext | null>(null)
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map())
  const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map())
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map())
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedAtRef = useRef<number>(0)
  const isPlayingRef = useRef<boolean>(false)

  const [tracks, setTracks] = useState<TrackState[]>([])
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    isLoading: true,
    currentTime: 0,
    totalDuration: 0,
  })

  // Calculate offset for a recording relative to meeting start
  const calculateOffset = useCallback((rec: Recording): number => {
    if (!meetingStartedAt) return 0
    return calculateRecordingOffset(rec.startedAt, rec.fileUrl, meetingStartedAt)
  }, [meetingStartedAt])

  // Initialize AudioContext and load all tracks
  useEffect(() => {
    if (!recordings || recordings.length === 0 || !meetingStartedAt) {
      setPlayerState(prev => ({ ...prev, isLoading: false }))
      return
    }

    let isMounted = true

    const init = async () => {
      // Create AudioContext
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      // Initialize tracks with offsets
      const initialTracks: TrackState[] = recordings.map(rec => ({
        id: rec.id,
        muted: false,
        volume: 1,
        loaded: false,
        error: null,
        offset: calculateOffset(rec),
        duration: rec.duration,
        participant: {
          id: rec.participant.id,
          name: rec.participant.name,
        },
      }))

      if (isMounted) {
        setTracks(initialTracks)
      }

      // Load all audio buffers
      const loadPromises = recordings.map(async (rec) => {
        try {
          const url = `${RECORDINGS_BASE_URL}/${rec.fileUrl}`
          const response = await fetch(url)

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const arrayBuffer = await response.arrayBuffer()
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

          // Store buffer
          buffersRef.current.set(rec.id, audioBuffer)

          // Update track state
          if (isMounted) {
            setTracks(prev => prev.map(t =>
              t.id === rec.id
                ? { ...t, loaded: true }
                : t
            ))
          }
        } catch (error) {
          console.error(`Failed to load ${rec.fileUrl}:`, error)
          if (isMounted) {
            setTracks(prev => prev.map(t =>
              t.id === rec.id
                ? { ...t, error: error instanceof Error ? error.message : 'Load failed' }
                : t
            ))
          }
        }
      })

      await Promise.all(loadPromises)

      // Calculate total duration (max of offset + duration for all tracks)
      const totalDuration = recordings.reduce((max, rec) => {
        const offset = calculateOffset(rec)
        return Math.max(max, offset + rec.duration)
      }, 0)

      if (isMounted) {
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          totalDuration,
        }))
      }
    }

    init()

    return () => {
      isMounted = false
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      sourceNodesRef.current.forEach(source => {
        try { source.stop() } catch {}
      })
      sourceNodesRef.current.clear()
      gainNodesRef.current.clear()
      buffersRef.current.clear()
      audioContextRef.current?.close()
    }
  }, [recordings, meetingStartedAt, calculateOffset])

  // Update current time during playback
  const updateTime = useCallback(() => {
    if (!audioContextRef.current || !isPlayingRef.current) return

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current
    const currentTime = pausedAtRef.current + elapsed

    setPlayerState(prev => {
      if (currentTime >= prev.totalDuration) {
        // Playback finished
        isPlayingRef.current = false
        return { ...prev, isPlaying: false, currentTime: prev.totalDuration }
      }
      return { ...prev, currentTime }
    })

    if (isPlayingRef.current) {
      animationFrameRef.current = requestAnimationFrame(updateTime)
    }
  }, [])

  // Start playback from given time
  const startPlayback = useCallback((fromTime: number) => {
    const audioContext = audioContextRef.current
    if (!audioContext) return

    // Stop any existing sources
    sourceNodesRef.current.forEach(source => {
      try { source.stop() } catch {}
    })
    sourceNodesRef.current.clear()
    gainNodesRef.current.clear()

    // Resume AudioContext if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }

    // Create and start source nodes for each track
    tracks.forEach(track => {
      if (!track.loaded) return

      const buffer = buffersRef.current.get(track.id)
      if (!buffer) return

      // Create gain node for this track
      const gainNode = audioContext.createGain()
      gainNode.gain.value = track.muted ? 0 : track.volume
      gainNode.connect(audioContext.destination)
      gainNodesRef.current.set(track.id, gainNode)

      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(gainNode)
      sourceNodesRef.current.set(track.id, source)

      const trackEndTime = track.offset + track.duration

      if (fromTime >= trackEndTime) {
        // Track already finished, don't play
        return
      }

      if (fromTime < track.offset) {
        // Schedule to start later
        const delay = track.offset - fromTime
        source.start(audioContext.currentTime + delay)
      } else {
        // Start immediately with offset into the buffer
        const offsetInBuffer = fromTime - track.offset
        source.start(0, offsetInBuffer)
      }
    })

    startTimeRef.current = audioContext.currentTime
    pausedAtRef.current = fromTime

    animationFrameRef.current = requestAnimationFrame(updateTime)
  }, [tracks, updateTime])

  // Play
  const play = useCallback(() => {
    if (isPlayingRef.current || playerState.isLoading) return

    isPlayingRef.current = true
    setPlayerState(prev => ({ ...prev, isPlaying: true }))
    startPlayback(playerState.currentTime)
  }, [playerState.isLoading, playerState.currentTime, startPlayback])

  // Pause
  const pause = useCallback(() => {
    if (!isPlayingRef.current) return

    isPlayingRef.current = false

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    // Calculate current position
    const audioContext = audioContextRef.current
    if (audioContext) {
      const elapsed = audioContext.currentTime - startTimeRef.current
      pausedAtRef.current = pausedAtRef.current + elapsed
    }

    // Stop all sources
    sourceNodesRef.current.forEach(source => {
      try { source.stop() } catch {}
    })
    sourceNodesRef.current.clear()

    setPlayerState(prev => ({
      ...prev,
      isPlaying: false,
      currentTime: pausedAtRef.current,
    }))
  }, [])

  // Seek
  const seek = useCallback((time: number) => {
    const wasPlaying = isPlayingRef.current

    // Stop current playback
    isPlayingRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    sourceNodesRef.current.forEach(source => {
      try { source.stop() } catch {}
    })
    sourceNodesRef.current.clear()

    const clampedTime = Math.max(0, Math.min(time, playerState.totalDuration))
    pausedAtRef.current = clampedTime

    setPlayerState(prev => ({ ...prev, currentTime: clampedTime, isPlaying: wasPlaying }))

    if (wasPlaying) {
      isPlayingRef.current = true
      startPlayback(clampedTime)
    }
  }, [playerState.totalDuration, startPlayback])

  // Seek and always start playing
  const seekAndPlay = useCallback((time: number) => {
    // Stop current playback
    isPlayingRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    sourceNodesRef.current.forEach(source => {
      try { source.stop() } catch {}
    })
    sourceNodesRef.current.clear()

    const clampedTime = Math.max(0, Math.min(time, playerState.totalDuration))
    pausedAtRef.current = clampedTime

    isPlayingRef.current = true
    setPlayerState(prev => ({ ...prev, currentTime: clampedTime, isPlaying: true }))
    startPlayback(clampedTime)
  }, [playerState.totalDuration, startPlayback])

  // Toggle mute for a track
  const toggleMute = useCallback((trackId: string) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t

      const newMuted = !t.muted
      const gainNode = gainNodesRef.current.get(trackId)
      if (gainNode) {
        gainNode.gain.value = newMuted ? 0 : t.volume
      }

      return { ...t, muted: newMuted }
    }))
  }, [])

  // Set volume for a track (0-1)
  const setVolume = useCallback((trackId: string, volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume))
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t

      const gainNode = gainNodesRef.current.get(trackId)
      if (gainNode && !t.muted) {
        gainNode.gain.value = clampedVolume
      }

      return { ...t, volume: clampedVolume }
    }))
  }, [])

  return {
    ...playerState,
    tracks,
    play,
    pause,
    seek,
    seekAndPlay,
    toggleMute,
    setVolume,
  }
}
