'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Mic, Volume2 } from 'lucide-react'

interface DeviceSelectProps {
  label: string
  devices: MediaDeviceInfo[]
  selectedDeviceId: string
  onDeviceChange: (deviceId: string) => void
  kind: 'audioinput' | 'audiooutput'
  disabled?: boolean
}

export function DeviceSelect({
  label,
  devices,
  selectedDeviceId,
  onDeviceChange,
  kind,
  disabled = false,
}: DeviceSelectProps) {
  const Icon = kind === 'audioinput' ? Mic : Volume2

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm text-gray-300">
        <Icon className="w-4 h-4" />
        {label}
      </Label>
      <Select
        value={selectedDeviceId}
        onValueChange={onDeviceChange}
        disabled={disabled || devices.length === 0}
      >
        <SelectTrigger className="w-full bg-gray-800 border-gray-600 text-white">
          <SelectValue placeholder={`Выберите ${kind === 'audioinput' ? 'микрофон' : 'динамики'}`} />
        </SelectTrigger>
        <SelectContent className="bg-gray-800 border-gray-600">
          {devices.map((device) => (
            <SelectItem
              key={device.deviceId}
              value={device.deviceId}
              className="text-white hover:bg-gray-700 focus:bg-gray-700"
            >
              {device.label || `${kind === 'audioinput' ? 'Микрофон' : 'Динамики'} ${device.deviceId.slice(0, 8)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
