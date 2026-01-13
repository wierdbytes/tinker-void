'use client'

import { useCallback, useEffect } from 'react'
import { Room } from 'livekit-client'
import { DeviceSelect } from './DeviceSelect'
import { AudioLevelMeter } from './AudioLevelMeter'
import { useAudioDevices } from './useAudioDevices'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AudioSettingsProps {
  /** LiveKit room instance (pass when in-call, omit when pre-join) */
  room?: Room | null
  /** Callback when devices are selected (for pre-join mode) */
  onDevicesChange?: (devices: { audioInputDeviceId: string; audioOutputDeviceId: string }) => void
  /** Additional className */
  className?: string
  /** Compact mode (no title) */
  compact?: boolean
}

export function AudioSettings({
  room,
  onDevicesChange,
  className,
  compact = false,
}: AudioSettingsProps) {
  const {
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
  } = useAudioDevices(room)

  // Notify parent of device changes
  useEffect(() => {
    if (onDevicesChange && selectedInputId) {
      onDevicesChange({
        audioInputDeviceId: selectedInputId,
        audioOutputDeviceId: selectedOutputId,
      })
    }
  }, [selectedInputId, selectedOutputId, onDevicesChange])

  const handleInputChange = useCallback((deviceId: string) => {
    setInputDevice(deviceId)
  }, [setInputDevice])

  const handleOutputChange = useCallback((deviceId: string) => {
    setOutputDevice(deviceId)
  }, [setOutputDevice])

  if (permissionError) {
    return (
      <div className={cn('space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700', className)}>
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
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
      <div className={cn('space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700', className)}>
        <div className="flex items-center gap-2 text-gray-400">
          <Mic className="w-5 h-5 animate-pulse" />
          <span className="text-sm">Запрос доступа к микрофону...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', !compact && 'p-4 bg-gray-800/50 rounded-lg border border-gray-700', className)}>
      {!compact && (
        <h3 className="text-sm font-medium text-white">Настройки аудио</h3>
      )}

      <DeviceSelect
        label="Микрофон"
        devices={audioInputDevices}
        selectedDeviceId={selectedInputId}
        onDeviceChange={handleInputChange}
        kind="audioinput"
      />

      <div className="space-y-2">
        <span className="text-xs text-gray-400">Уровень сигнала</span>
        <AudioLevelMeter stream={previewStream} />
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
