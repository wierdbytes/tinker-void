'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Mic, Volume2, Video } from 'lucide-react'

interface DeviceSelectProps {
  label: string
  devices: MediaDeviceInfo[]
  selectedDeviceId: string
  onDeviceChange: (deviceId: string) => void
  kind: 'audioinput' | 'audiooutput' | 'videoinput'
  disabled?: boolean
}

function getDeviceIcon(kind: DeviceSelectProps['kind']) {
  switch (kind) {
    case 'audioinput':
      return Mic
    case 'audiooutput':
      return Volume2
    case 'videoinput':
      return Video
  }
}

function getDevicePlaceholder(kind: DeviceSelectProps['kind']) {
  switch (kind) {
    case 'audioinput':
      return 'Выберите микрофон'
    case 'audiooutput':
      return 'Выберите динамики'
    case 'videoinput':
      return 'Выберите камеру'
  }
}

function getDeviceFallbackLabel(kind: DeviceSelectProps['kind'], deviceId: string) {
  switch (kind) {
    case 'audioinput':
      return `Микрофон ${deviceId.slice(0, 8)}`
    case 'audiooutput':
      return `Динамики ${deviceId.slice(0, 8)}`
    case 'videoinput':
      return `Камера ${deviceId.slice(0, 8)}`
  }
}

export function DeviceSelect({
  label,
  devices,
  selectedDeviceId,
  onDeviceChange,
  kind,
  disabled = false,
}: DeviceSelectProps) {
  const Icon = getDeviceIcon(kind)

  // Filter out devices with empty deviceId (happens before permission is granted)
  const validDevices = devices.filter(d => d.deviceId && d.deviceId !== '')

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="w-4 h-4" />
        {label}
      </Label>
      <Select
        value={selectedDeviceId}
        onValueChange={onDeviceChange}
        disabled={disabled || validDevices.length === 0}
      >
        <SelectTrigger className="w-full bg-surface-primary border-border/50 text-foreground hover:border-border transition-colors">
          <SelectValue placeholder={getDevicePlaceholder(kind)} />
        </SelectTrigger>
        <SelectContent className="bg-card border-border/50 shadow-soft-lg">
          {validDevices.map((device) => (
            <SelectItem
              key={device.deviceId}
              value={device.deviceId}
              className="text-foreground focus:bg-muted focus:text-foreground"
            >
              {device.label || getDeviceFallbackLabel(kind, device.deviceId)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
