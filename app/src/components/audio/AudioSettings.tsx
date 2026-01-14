'use client'

import { useCallback, useEffect } from 'react'
import { Room } from 'livekit-client'
import { DeviceSelect } from './DeviceSelect'
import { AudioLevelMeter } from './AudioLevelMeter'
import { useAudioDevices } from './useAudioDevices'
import { Button } from '@/components/ui/button'
import { Mic, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AudioSettingsProps {
  room?: Room | null
  onDevicesChange?: (devices: { audioInputDeviceId: string; audioOutputDeviceId: string }) => void
  className?: string
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
      <div className={cn('space-y-4 p-4 rounded-xl bg-destructive/5 border border-destructive/20', className)}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Доступ запрещён</p>
            <p className="text-xs text-muted-foreground mt-0.5">{permissionError}</p>
          </div>
        </div>
        <Button onClick={requestPermission} variant="outline" size="sm" className="w-full">
          Попробовать снова
        </Button>
      </div>
    )
  }

  if (!permissionGranted) {
    return (
      <div className={cn('space-y-3 p-4 rounded-xl bg-surface-secondary', className)}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Mic className="w-4 h-4 text-primary animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Запрос доступа</p>
            <p className="text-xs text-muted-foreground">Разрешите доступ к микрофону</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', !compact && 'p-4 rounded-xl bg-surface-secondary', className)}>
      {!compact && (
        <h3 className="text-sm font-medium text-foreground">Настройки аудио</h3>
      )}

      <DeviceSelect
        label="Микрофон"
        devices={audioInputDevices}
        selectedDeviceId={selectedInputId}
        onDeviceChange={handleInputChange}
        kind="audioinput"
      />

      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Уровень сигнала</span>
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
