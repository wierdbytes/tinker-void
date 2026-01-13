'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { Room, Track } from 'livekit-client'

const STORAGE_KEY_INPUT = 'tinkerdesk-audio-input-device'
const STORAGE_KEY_OUTPUT = 'tinkerdesk-audio-output-device'

export interface AudioDevicesState {
  audioInputDevices: MediaDeviceInfo[]
  audioOutputDevices: MediaDeviceInfo[]
  selectedInputId: string
  selectedOutputId: string
  previewStream: MediaStream | null
  permissionGranted: boolean
  permissionError: string | null
  supportsAudioOutput: boolean
}

export interface AudioDevicesActions {
  setInputDevice: (deviceId: string) => Promise<void>
  setOutputDevice: (deviceId: string) => Promise<void>
  requestPermission: () => Promise<void>
  stopPreview: () => void
}

export function useAudioDevices(room?: Room | null): AudioDevicesState & AudioDevicesActions {
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([])
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInputId, setSelectedInputId] = useState('')
  const [selectedOutputId, setSelectedOutputId] = useState('')
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)

  const supportsAudioOutput = typeof window !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype

  // Load saved devices from localStorage
  useEffect(() => {
    const savedInput = localStorage.getItem(STORAGE_KEY_INPUT)
    const savedOutput = localStorage.getItem(STORAGE_KEY_OUTPUT)
    if (savedInput) setSelectedInputId(savedInput)
    if (savedOutput) setSelectedOutputId(savedOutput)
  }, [])

  // Enumerate devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs = devices.filter(d => d.kind === 'audioinput')
      const outputs = devices.filter(d => d.kind === 'audiooutput')
      setAudioInputDevices(inputs)
      setAudioOutputDevices(outputs)
      return { inputs, outputs }
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
      return { inputs: [], outputs: [] }
    }
  }, [])

  // Request permission and start preview
  const requestPermission = useCallback(async () => {
    try {
      setPermissionError(null)

      // If room exists and is connected, get stream from local participant
      if (room?.localParticipant) {
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
        if (micPub?.track?.mediaStream) {
          setPreviewStream(micPub.track.mediaStream)
          streamRef.current = micPub.track.mediaStream
        }
        setPermissionGranted(true)

        // Get active devices from room
        const activeInput = room.getActiveDevice('audioinput')
        const activeOutput = room.getActiveDevice('audiooutput')
        if (activeInput) {
          setSelectedInputId(activeInput)
          localStorage.setItem(STORAGE_KEY_INPUT, activeInput)
        }
        if (activeOutput) {
          setSelectedOutputId(activeOutput)
          localStorage.setItem(STORAGE_KEY_OUTPUT, activeOutput)
        }
      } else {
        // Pre-join mode: request microphone access
        const savedInput = localStorage.getItem(STORAGE_KEY_INPUT)
        const constraints: MediaStreamConstraints = {
          audio: savedInput ? { deviceId: { exact: savedInput } } : true
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        setPreviewStream(stream)
        streamRef.current = stream
        setPermissionGranted(true)

        // Get actual device ID from track
        const audioTrack = stream.getAudioTracks()[0]
        if (audioTrack) {
          const settings = audioTrack.getSettings()
          if (settings.deviceId) {
            setSelectedInputId(settings.deviceId)
            localStorage.setItem(STORAGE_KEY_INPUT, settings.deviceId)
          }
        }
      }

      // Enumerate devices after permission
      const { inputs, outputs } = await enumerateDevices()

      // Set default output if not set
      const savedOutput = localStorage.getItem(STORAGE_KEY_OUTPUT)
      if (!savedOutput && outputs.length > 0) {
        setSelectedOutputId(outputs[0].deviceId)
        localStorage.setItem(STORAGE_KEY_OUTPUT, outputs[0].deviceId)
      }
    } catch (err) {
      console.error('Permission error:', err)
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setPermissionError('Доступ к микрофону запрещён. Разрешите доступ в настройках браузера.')
        } else if (err.name === 'NotFoundError') {
          setPermissionError('Микрофон не найден.')
        } else {
          setPermissionError('Не удалось получить доступ к микрофону.')
        }
      }
    }
  }, [room, enumerateDevices])

  // Set input device
  const setInputDevice = useCallback(async (deviceId: string) => {
    setSelectedInputId(deviceId)
    localStorage.setItem(STORAGE_KEY_INPUT, deviceId)

    if (room?.localParticipant) {
      // In-call: switch device through LiveKit
      try {
        await room.switchActiveDevice('audioinput', deviceId)
        // Update preview stream
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
        if (micPub?.track?.mediaStream) {
          setPreviewStream(micPub.track.mediaStream)
          streamRef.current = micPub.track.mediaStream
        }
      } catch (err) {
        console.error('Failed to switch audio input:', err)
      }
    } else {
      // Pre-join: get new stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } }
        })
        setPreviewStream(stream)
        streamRef.current = stream
      } catch (err) {
        console.error('Failed to switch device:', err)
      }
    }
  }, [room])

  // Set output device
  const setOutputDevice = useCallback(async (deviceId: string) => {
    setSelectedOutputId(deviceId)
    localStorage.setItem(STORAGE_KEY_OUTPUT, deviceId)

    if (room) {
      try {
        await room.switchActiveDevice('audiooutput', deviceId)
      } catch (err) {
        console.error('Failed to switch audio output:', err)
      }
    }
  }, [room])

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

  // Initialize on mount
  useEffect(() => {
    requestPermission()
  }, [])

  // Re-initialize when room becomes available
  useEffect(() => {
    if (room?.localParticipant) {
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
    audioInputDevices,
    audioOutputDevices,
    selectedInputId,
    selectedOutputId,
    previewStream,
    permissionGranted,
    permissionError,
    supportsAudioOutput,
    setInputDevice,
    setOutputDevice,
    requestPermission,
    stopPreview,
  }
}
