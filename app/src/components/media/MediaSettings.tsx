'use client'

import { useCallback, useEffect } from 'react'
import { Room } from 'livekit-client'
import { DeviceSelect } from '@/components/audio/DeviceSelect'
import { AudioLevelMeter } from '@/components/audio/AudioLevelMeter'
import { useAudioDevices } from '@/components/audio/useAudioDevices'
import { useVideoDevices } from '@/components/video/useVideoDevices'
import { Button } from '@/components/ui/button'
import { Mic, Video, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MediaSettingsProps {
  room?: Room | null
  onDevicesChange?: (devices: {
    audioInputDeviceId: string
    audioOutputDeviceId: string
    videoInputDeviceId: string
  }) => void
  className?: string
  compact?: boolean
  showVideo?: boolean
}

export function MediaSettings({
  room,
  onDevicesChange,
  className,
  compact = false,
  showVideo = true,
}: MediaSettingsProps) {
  const {
    audioInputDevices,
    audioOutputDevices,
    selectedInputId,
    selectedOutputId,
    previewStream: audioPreviewStream,
    permissionGranted: audioPermissionGranted,
    permissionError: audioPermissionError,
    supportsAudioOutput,
    setInputDevice,
    setOutputDevice,
    requestPermission: requestAudioPermission,
  } = useAudioDevices(room)

  const {
    videoInputDevices,
    selectedVideoId,
    permissionError: videoPermissionError,
    setVideoDevice,
    requestPermission: requestVideoPermission,
  } = useVideoDevices(room)

  // Request video permission when showVideo is enabled to get device list
  useEffect(() => {
    if (showVideo && videoInputDevices.length === 0 && !videoPermissionError) {
      requestVideoPermission()
    }
  }, [showVideo, videoInputDevices.length, videoPermissionError, requestVideoPermission])

  useEffect(() => {
    if (onDevicesChange && selectedInputId) {
      onDevicesChange({
        audioInputDeviceId: selectedInputId,
        audioOutputDeviceId: selectedOutputId,
        videoInputDeviceId: selectedVideoId,
      })
    }
  }, [selectedInputId, selectedOutputId, selectedVideoId, onDevicesChange])

  const handleInputChange = useCallback((deviceId: string) => {
    setInputDevice(deviceId)
  }, [setInputDevice])

  const handleOutputChange = useCallback((deviceId: string) => {
    setOutputDevice(deviceId)
  }, [setOutputDevice])

  const handleVideoChange = useCallback((deviceId: string) => {
    setVideoDevice(deviceId)
  }, [setVideoDevice])

  // Error states
  if (audioPermissionError) {
    return (
      <div className={cn('space-y-4 p-4 rounded-xl bg-destructive/5 border border-destructive/20', className)}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Доступ к микрофону запрещён</p>
            <p className="text-xs text-muted-foreground mt-0.5">{audioPermissionError}</p>
          </div>
        </div>
        <Button onClick={requestAudioPermission} variant="outline" size="sm" className="w-full">
          Попробовать снова
        </Button>
      </div>
    )
  }

  if (!audioPermissionGranted) {
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
    <div className={cn('space-y-6', !compact && 'p-4 rounded-xl bg-surface-secondary', className)}>
      {/* Audio Section */}
      <div className="space-y-4">
        {!compact && (
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Mic className="w-4 h-4" />
            Аудио
          </h3>
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
          <AudioLevelMeter stream={audioPreviewStream} />
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

      {/* Video Section */}
      {showVideo && (
        <>
          <div className="border-t border-border/50" />

          <div className="space-y-4">
            {!compact && (
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Video className="w-4 h-4" />
                Видео
              </h3>
            )}

            {videoPermissionError ? (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-destructive">{videoPermissionError}</p>
                    <Button
                      onClick={requestVideoPermission}
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 text-xs"
                    >
                      Попробовать снова
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <DeviceSelect
                label="Камера"
                devices={videoInputDevices}
                selectedDeviceId={selectedVideoId}
                onDeviceChange={handleVideoChange}
                kind="videoinput"
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
