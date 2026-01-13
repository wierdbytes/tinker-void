'use client'

import { useCallback, useEffect, useState } from 'react'
import { DeviceSelect } from './DeviceSelect'
import { AudioLevelMeter } from './AudioLevelMeter'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, AlertCircle } from 'lucide-react'

const STORAGE_KEY_INPUT = 'tinkerdesk-audio-input-device'
const STORAGE_KEY_OUTPUT = 'tinkerdesk-audio-output-device'

interface PreJoinAudioSetupProps {
  onDevicesSelected: (devices: { audioInputDeviceId: string; audioOutputDeviceId: string }) => void
}

export function PreJoinAudioSetup({ onDevicesSelected }: PreJoinAudioSetupProps) {
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([])
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInputId, setSelectedInputId] = useState('')
  const [selectedOutputId, setSelectedOutputId] = useState('')
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)

  // Check if audiooutput is supported (not in Safari)
  const supportsAudioOutput = typeof window !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype

  // Load saved devices from localStorage
  useEffect(() => {
    const savedInput = localStorage.getItem(STORAGE_KEY_INPUT)
    const savedOutput = localStorage.getItem(STORAGE_KEY_OUTPUT)
    if (savedInput) setSelectedInputId(savedInput)
    if (savedOutput) setSelectedOutputId(savedOutput)
  }, [])

  // Request permission and enumerate devices
  const requestPermission = useCallback(async () => {
    try {
      setPermissionError(null)

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedInputId ? { deviceId: { exact: selectedInputId } } : true
      })

      setPreviewStream(stream)
      setPermissionGranted(true)

      // Now enumerate devices (labels will be available after permission)
      const devices = await navigator.mediaDevices.enumerateDevices()

      const inputs = devices.filter(d => d.kind === 'audioinput')
      const outputs = devices.filter(d => d.kind === 'audiooutput')

      setAudioInputDevices(inputs)
      setAudioOutputDevices(outputs)

      // Set default devices if not already set
      if (!selectedInputId && inputs.length > 0) {
        const defaultInput = inputs[0].deviceId
        setSelectedInputId(defaultInput)
        localStorage.setItem(STORAGE_KEY_INPUT, defaultInput)
      }

      if (!selectedOutputId && outputs.length > 0) {
        const defaultOutput = outputs[0].deviceId
        setSelectedOutputId(defaultOutput)
        localStorage.setItem(STORAGE_KEY_OUTPUT, defaultOutput)
      }
    } catch (err) {
      console.error('Permission error:', err)
      setPermissionError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Доступ к микрофону запрещён. Разрешите доступ в настройках браузера.'
          : 'Не удалось получить доступ к микрофону.'
      )
    }
  }, [selectedInputId, selectedOutputId])

  // Request permission on mount
  useEffect(() => {
    requestPermission()
  }, [])

  // Update preview stream when input device changes
  const handleInputChange = useCallback(async (deviceId: string) => {
    setSelectedInputId(deviceId)
    localStorage.setItem(STORAGE_KEY_INPUT, deviceId)

    // Stop current stream
    if (previewStream) {
      previewStream.getTracks().forEach(track => track.stop())
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      })
      setPreviewStream(stream)
    } catch (err) {
      console.error('Failed to switch device:', err)
    }
  }, [previewStream])

  const handleOutputChange = useCallback((deviceId: string) => {
    setSelectedOutputId(deviceId)
    localStorage.setItem(STORAGE_KEY_OUTPUT, deviceId)
  }, [])

  // Toggle mute for preview
  const toggleMute = useCallback(() => {
    if (previewStream) {
      previewStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted
      })
      setIsMuted(!isMuted)
    }
  }, [previewStream, isMuted])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [previewStream])

  // Notify parent of selected devices
  useEffect(() => {
    if (selectedInputId) {
      onDevicesSelected({
        audioInputDeviceId: selectedInputId,
        audioOutputDeviceId: selectedOutputId,
      })
    }
  }, [selectedInputId, selectedOutputId, onDevicesSelected])

  if (permissionError) {
    return (
      <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{permissionError}</span>
        </div>
        <Button onClick={requestPermission} variant="outline" size="sm">
          Попробовать снова
        </Button>
      </div>
    )
  }

  if (!permissionGranted) {
    return (
      <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center gap-2 text-gray-400">
          <Mic className="w-5 h-5" />
          <span className="text-sm">Запрос доступа к микрофону...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
      <h3 className="text-sm font-medium text-white">Настройки аудио</h3>

      <DeviceSelect
        label="Микрофон"
        devices={audioInputDevices}
        selectedDeviceId={selectedInputId}
        onDeviceChange={handleInputChange}
        kind="audioinput"
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Уровень сигнала</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleMute}
            className="h-6 w-6 p-0"
          >
            {isMuted ? (
              <MicOff className="w-4 h-4 text-red-400" />
            ) : (
              <Mic className="w-4 h-4 text-green-400" />
            )}
          </Button>
        </div>
        <AudioLevelMeter stream={isMuted ? null : previewStream} />
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
