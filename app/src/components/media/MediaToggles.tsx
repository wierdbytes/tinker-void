'use client'

import { Mic, MicOff, Video, VideoOff, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DeviceSelect } from '@/components/audio/DeviceSelect'
import { AudioLevelMeter } from '@/components/audio/AudioLevelMeter'
import { cn } from '@/lib/utils'

interface MediaTogglesProps {
  micEnabled: boolean
  cameraEnabled: boolean
  onMicToggle: () => void
  onCameraToggle: () => void
  micPermissionGranted?: boolean
  cameraPermissionGranted?: boolean
  // Audio device props
  audioInputDevices?: MediaDeviceInfo[]
  audioOutputDevices?: MediaDeviceInfo[]
  selectedAudioInputId?: string
  selectedAudioOutputId?: string
  onAudioInputChange?: (deviceId: string) => void
  onAudioOutputChange?: (deviceId: string) => void
  audioPreviewStream?: MediaStream | null
  supportsAudioOutput?: boolean
  // Video device props
  videoInputDevices?: MediaDeviceInfo[]
  selectedVideoInputId?: string
  onVideoInputChange?: (deviceId: string) => void
  onRequestVideoPermission?: () => void
}

export function MediaToggles({
  micEnabled,
  cameraEnabled,
  onMicToggle,
  onCameraToggle,
  micPermissionGranted = true,
  cameraPermissionGranted = true,
  // Audio device props
  audioInputDevices = [],
  audioOutputDevices = [],
  selectedAudioInputId = '',
  selectedAudioOutputId = '',
  onAudioInputChange,
  onAudioOutputChange,
  audioPreviewStream,
  supportsAudioOutput = true,
  // Video device props
  videoInputDevices = [],
  selectedVideoInputId = '',
  onVideoInputChange,
  onRequestVideoPermission,
}: MediaTogglesProps) {
  // Filter out devices with empty deviceId (happens before permission is granted)
  const validAudioInputDevices = audioInputDevices.filter(d => d.deviceId && d.deviceId !== '')
  const validVideoInputDevices = videoInputDevices.filter(d => d.deviceId && d.deviceId !== '')

  const hasAudioDevices = validAudioInputDevices.length > 0 && onAudioInputChange
  const hasVideoDevices = validVideoInputDevices.length > 0 && onVideoInputChange
  const canRequestVideoDevices = onVideoInputChange && onRequestVideoPermission

  return (
    <div className="flex items-center justify-center gap-4">
      {/* Microphone Toggle with Settings */}
      <div className="relative">
        <button
          type="button"
          onClick={onMicToggle}
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95',
            micEnabled
              ? 'bg-primary text-primary-foreground shadow-soft'
              : 'bg-muted text-muted-foreground border border-border/50'
          )}
          aria-label={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
        >
          {micEnabled ? (
            <Mic className="w-6 h-6" />
          ) : (
            <MicOff className="w-6 h-6" />
          )}
        </button>

        {/* Settings dropdown trigger */}
        {hasAudioDevices && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-border/50 flex items-center justify-center hover:bg-muted transition-colors shadow-sm"
                aria-label="Настройки аудио"
                onClick={(e) => e.stopPropagation()}
              >
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 bg-card border-border/50 shadow-soft-lg p-4"
              align="start"
              side="bottom"
              sideOffset={8}
            >
              <div className="space-y-4">
                <DeviceSelect
                  label="Микрофон"
                  devices={audioInputDevices}
                  selectedDeviceId={selectedAudioInputId}
                  onDeviceChange={onAudioInputChange}
                  kind="audioinput"
                />

                {audioPreviewStream && (
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">Уровень сигнала</span>
                    <AudioLevelMeter stream={audioPreviewStream} />
                  </div>
                )}

                {supportsAudioOutput && audioOutputDevices.length > 0 && onAudioOutputChange && (
                  <DeviceSelect
                    label="Динамики"
                    devices={audioOutputDevices}
                    selectedDeviceId={selectedAudioOutputId}
                    onDeviceChange={onAudioOutputChange}
                    kind="audiooutput"
                  />
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Camera Toggle with Settings */}
      <div className="relative">
        <button
          type="button"
          onClick={onCameraToggle}
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95',
            cameraEnabled
              ? 'bg-primary text-primary-foreground shadow-soft'
              : 'bg-muted text-muted-foreground border border-border/50'
          )}
          aria-label={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
        >
          {cameraEnabled ? (
            <Video className="w-6 h-6" />
          ) : (
            <VideoOff className="w-6 h-6" />
          )}
        </button>

        {/* Settings dropdown trigger - show if has devices OR can request permission */}
        {(hasVideoDevices || canRequestVideoDevices) && (
          <Popover
            onOpenChange={(open) => {
              // Request permission when opening dropdown if no devices yet
              if (open && !hasVideoDevices && onRequestVideoPermission) {
                onRequestVideoPermission()
              }
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-border/50 flex items-center justify-center hover:bg-muted transition-colors shadow-sm"
                aria-label="Настройки камеры"
                onClick={(e) => e.stopPropagation()}
              >
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 bg-card border-border/50 shadow-soft-lg p-4"
              align="start"
              side="bottom"
              sideOffset={8}
            >
              {hasVideoDevices ? (
                <DeviceSelect
                  label="Камера"
                  devices={videoInputDevices}
                  selectedDeviceId={selectedVideoInputId}
                  onDeviceChange={onVideoInputChange}
                  kind="videoinput"
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Загрузка устройств...
                </p>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}
