'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { Room, Track } from 'livekit-client'

const STORAGE_KEY_VIDEO_INPUT = 'tinkervoid-video-input-device'
const STORAGE_KEY_CAMERA_ENABLED = 'tinkervoid-camera-enabled'
const STORAGE_KEY_MEDIA_INITIALIZED = 'tinkervoid-media-initialized'

export interface VideoDevicesState {
  videoInputDevices: MediaDeviceInfo[]
  selectedVideoId: string
  previewStream: MediaStream | null
  permissionGranted: boolean
  permissionError: string | null
  isEnabled: boolean
}

export interface VideoDevicesActions {
  setVideoDevice: (deviceId: string) => Promise<void>
  setEnabled: (enabled: boolean) => void
  requestPermission: () => Promise<void>
  stopPreview: () => void
}

export function useVideoDevices(room?: Room | null): VideoDevicesState & VideoDevicesActions {
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState('')
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [isEnabled, setIsEnabledState] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)

  // Load saved device and enabled state from localStorage
  useEffect(() => {
    const savedVideo = localStorage.getItem(STORAGE_KEY_VIDEO_INPUT)
    const savedEnabled = localStorage.getItem(STORAGE_KEY_CAMERA_ENABLED)
    const mediaInitialized = localStorage.getItem(STORAGE_KEY_MEDIA_INITIALIZED)

    if (savedVideo) setSelectedVideoId(savedVideo)

    // For new users (not initialized), camera is OFF
    // For returning users, restore their preference
    if (mediaInitialized === 'true' && savedEnabled === 'true') {
      setIsEnabledState(true)
    }
  }, [])

  // Enumerate devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices.filter(d => d.kind === 'videoinput')
      setVideoInputDevices(videoInputs)
      return videoInputs
    } catch (err) {
      console.error('Failed to enumerate video devices:', err)
      return []
    }
  }, [])

  // Request permission and start preview
  const requestPermission = useCallback(async () => {
    try {
      setPermissionError(null)

      // If room exists and camera is enabled, get stream from local participant
      if (room?.localParticipant) {
        const cameraPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
        if (cameraPub?.track?.mediaStream) {
          setPreviewStream(cameraPub.track.mediaStream)
          streamRef.current = cameraPub.track.mediaStream
          setPermissionGranted(true)

          // Get active device from room
          const activeVideo = room.getActiveDevice('videoinput')
          if (activeVideo) {
            setSelectedVideoId(activeVideo)
            localStorage.setItem(STORAGE_KEY_VIDEO_INPUT, activeVideo)
          }

          // Enumerate devices after permission
          await enumerateDevices()
          return
        }

        // Camera is off in room - request temporary access to enumerate devices
        const savedVideo = localStorage.getItem(STORAGE_KEY_VIDEO_INPUT)
        const constraints: MediaStreamConstraints = {
          video: savedVideo ? { deviceId: { ideal: savedVideo } } : true
        }

        const tempStream = await navigator.mediaDevices.getUserMedia(constraints)
        setPermissionGranted(true)

        // Get actual device ID from track
        const videoTrack = tempStream.getVideoTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          if (settings.deviceId) {
            setSelectedVideoId(settings.deviceId)
            localStorage.setItem(STORAGE_KEY_VIDEO_INPUT, settings.deviceId)
          }
        }

        // Enumerate devices after permission
        await enumerateDevices()

        // Stop temporary stream (we don't need preview when camera is off in room)
        tempStream.getTracks().forEach(track => track.stop())
      } else {
        // Pre-join mode: request camera access
        const savedVideo = localStorage.getItem(STORAGE_KEY_VIDEO_INPUT)
        const constraints: MediaStreamConstraints = {
          video: savedVideo ? { deviceId: { exact: savedVideo } } : true
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        setPreviewStream(stream)
        streamRef.current = stream
        setPermissionGranted(true)

        // Get actual device ID from track
        const videoTrack = stream.getVideoTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          if (settings.deviceId) {
            setSelectedVideoId(settings.deviceId)
            localStorage.setItem(STORAGE_KEY_VIDEO_INPUT, settings.deviceId)
          }
        }

        // Enumerate devices after permission
        await enumerateDevices()
      }
    } catch (err) {
      console.error('Video permission error:', err)
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setPermissionError('Доступ к камере запрещён. Разрешите доступ в настройках браузера.')
        } else if (err.name === 'NotFoundError') {
          setPermissionError('Камера не найдена.')
        } else {
          setPermissionError('Не удалось получить доступ к камере.')
        }
      }
    }
  }, [room, enumerateDevices])

  // Set video device
  const setVideoDevice = useCallback(async (deviceId: string) => {
    setSelectedVideoId(deviceId)
    localStorage.setItem(STORAGE_KEY_VIDEO_INPUT, deviceId)

    if (room?.localParticipant) {
      // In-call: switch device through LiveKit
      try {
        await room.switchActiveDevice('videoinput', deviceId)
        // Update preview stream
        const cameraPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
        if (cameraPub?.track?.mediaStream) {
          setPreviewStream(cameraPub.track.mediaStream)
          streamRef.current = cameraPub.track.mediaStream
        }
      } catch (err) {
        console.error('Failed to switch video input:', err)
      }
    } else if (streamRef.current) {
      // Pre-join: if there's an existing stream, switch to new device
      // This handles the case when user changes device while camera is "off"
      // but permission was already granted (stream exists from dropdown open)
      streamRef.current.getTracks().forEach(track => track.stop())
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } }
        })
        setPreviewStream(stream)
        streamRef.current = stream
      } catch (err) {
        console.error('Failed to switch video device:', err)
      }
    }
    // If no stream exists and camera is off, just save the deviceId for later
  }, [room])

  // Set enabled state
  const setEnabled = useCallback((enabled: boolean) => {
    setIsEnabledState(enabled)
    localStorage.setItem(STORAGE_KEY_CAMERA_ENABLED, String(enabled))
    localStorage.setItem(STORAGE_KEY_MEDIA_INITIALIZED, 'true')

    if (enabled && !room) {
      // Request stream when enabling (pre-join mode)
      // Always request if no active stream exists
      if (!streamRef.current) {
        requestPermission()
      }
    } else if (!enabled && streamRef.current && !room) {
      // Stop preview when disabling (pre-join only)
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setPreviewStream(null)
    }
  }, [requestPermission, room])

  // Stop preview stream
  const stopPreview = useCallback(() => {
    if (streamRef.current && !room) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setPreviewStream(null)
    }
  }, [room])

  // Listen to device changes
  useEffect(() => {
    const handleDeviceChange = () => {
      enumerateDevices()
    }
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [enumerateDevices])

  // Initialize on mount if enabled
  useEffect(() => {
    if (isEnabled) {
      requestPermission()
    } else {
      // Just enumerate devices without requesting permission
      enumerateDevices()
    }
  }, [])

  // Re-initialize when room becomes available
  useEffect(() => {
    if (room?.localParticipant && isEnabled) {
      requestPermission()
    }
  }, [room?.localParticipant])

  // Cleanup on unmount (only if not in room)
  useEffect(() => {
    return () => {
      if (!room && streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [room])

  return {
    videoInputDevices,
    selectedVideoId,
    previewStream,
    permissionGranted,
    permissionError,
    isEnabled,
    setVideoDevice,
    setEnabled,
    requestPermission,
    stopPreview,
  }
}
