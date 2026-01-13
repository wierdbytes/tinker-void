'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRoomContext, useLocalParticipant } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { DeviceSelect } from './DeviceSelect'
import { AudioLevelMeter } from './AudioLevelMeter'

const STORAGE_KEY_INPUT = 'tinkerdesk-audio-input-device'
const STORAGE_KEY_OUTPUT = 'tinkerdesk-audio-output-device'

export function InCallAudioSettings() {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([])
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInputId, setSelectedInputId] = useState('')
  const [selectedOutputId, setSelectedOutputId] = useState('')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)

  // Check if audiooutput is supported
  const supportsAudioOutput = typeof window !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype

  // Enumerate devices
  useEffect(() => {
    const loadDevices = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setAudioInputDevices(devices.filter(d => d.kind === 'audioinput'))
      setAudioOutputDevices(devices.filter(d => d.kind === 'audiooutput'))
    }

    loadDevices()

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', loadDevices)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
    }
  }, [])

  // Get current active devices
  useEffect(() => {
    if (room) {
      const activeInput = room.getActiveDevice('audioinput')
      const activeOutput = room.getActiveDevice('audiooutput')

      if (activeInput) {
        setSelectedInputId(activeInput)
      } else {
        // Fallback to localStorage
        const saved = localStorage.getItem(STORAGE_KEY_INPUT)
        if (saved) setSelectedInputId(saved)
      }

      if (activeOutput) {
        setSelectedOutputId(activeOutput)
      } else {
        const saved = localStorage.getItem(STORAGE_KEY_OUTPUT)
        if (saved) setSelectedOutputId(saved)
      }
    }
  }, [room])

  // Get local audio stream for level meter
  useEffect(() => {
    if (localParticipant) {
      const micPub = localParticipant.getTrackPublication(Track.Source.Microphone)
      if (micPub?.track?.mediaStream) {
        setLocalStream(micPub.track.mediaStream)
      }
    }
  }, [localParticipant])

  const handleInputChange = useCallback(async (deviceId: string) => {
    setSelectedInputId(deviceId)
    localStorage.setItem(STORAGE_KEY_INPUT, deviceId)

    try {
      await room.switchActiveDevice('audioinput', deviceId)
    } catch (err) {
      console.error('Failed to switch audio input:', err)
    }
  }, [room])

  const handleOutputChange = useCallback(async (deviceId: string) => {
    setSelectedOutputId(deviceId)
    localStorage.setItem(STORAGE_KEY_OUTPUT, deviceId)

    try {
      await room.switchActiveDevice('audiooutput', deviceId)
    } catch (err) {
      console.error('Failed to switch audio output:', err)
    }
  }, [room])

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white">Настройки аудио</h3>

      <DeviceSelect
        label="Микрофон"
        devices={audioInputDevices}
        selectedDeviceId={selectedInputId}
        onDeviceChange={handleInputChange}
        kind="audioinput"
      />

      <div className="space-y-1">
        <span className="text-xs text-gray-400">Уровень сигнала</span>
        <AudioLevelMeter stream={localStream} />
      </div>

      {supportsAudioOutput && (
        <DeviceSelect
          label="Динамики"
          devices={audioOutputDevices}
          selectedDeviceId={selectedOutputId}
          onDeviceChange={handleOutputChange}
          kind="audiooutput"
        />
      )}
    </div>
  )
}
