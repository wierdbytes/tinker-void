'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AudioSettings } from '@/components/audio'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Users, Settings, ChevronDown, ArrowRight } from 'lucide-react'

interface AudioDevices {
  audioInputDeviceId: string
  audioOutputDeviceId: string
}

function SoundWaveIcon({ className }: { className?: string }) {
  return (
    <div className={`flex items-end gap-0.5 h-6 ${className}`}>
      <div className="w-1 bg-current rounded-full sound-wave" style={{ height: '40%' }} />
      <div className="w-1 bg-current rounded-full sound-wave sound-wave-delay-1" style={{ height: '70%' }} />
      <div className="w-1 bg-current rounded-full sound-wave sound-wave-delay-2" style={{ height: '100%' }} />
      <div className="w-1 bg-current rounded-full sound-wave sound-wave-delay-3" style={{ height: '60%' }} />
      <div className="w-1 bg-current rounded-full sound-wave" style={{ height: '30%' }} />
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [roomName, setRoomName] = useState('')
  const [userName, setUserName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [audioDevices, setAudioDevices] = useState<AudioDevices>({
    audioInputDeviceId: '',
    audioOutputDeviceId: '',
  })

  const handleDevicesChange = useCallback((devices: AudioDevices) => {
    setAudioDevices(devices)
  }, [])

  const createRoom = async () => {
    if (!roomName.trim() || !userName.trim()) return

    setIsLoading(true)
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName }),
      })
      const data = await res.json()

      if (data.secretId) {
        router.push(`/s/${data.secretId}?name=${encodeURIComponent(userName)}`)
      }
    } catch (error) {
      console.error('Failed to create room:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-primary/5 to-accent/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-primary/5 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-end gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 px-6 py-12">
        <div className="max-w-md mx-auto">
          {/* Hero section */}
          <div className="text-center mb-10 fade-in-up">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 mb-6 glow-primary">
              <SoundWaveIcon className="text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
              Tinker Desk
            </h1>
            <p className="text-muted-foreground text-lg">
              создайте своё пространство
            </p>
          </div>

          {/* Main card */}
          <Card className="shadow-soft-lg border-border/50 fade-in-up fade-in-delay-1">
            <CardContent className="p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="userName" className="text-sm font-medium">
                  Ваше имя
                </Label>
                <Input
                  id="userName"
                  placeholder="Как вас называть?"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="h-11 bg-surface-primary border-border/50 focus:border-primary/50 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roomName" className="text-sm font-medium">
                  Название встречи
                </Label>
                <Input
                  id="roomName"
                  placeholder="Например: Дейли стендап"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createRoom()}
                  className="h-11 bg-surface-primary border-border/50 focus:border-primary/50 transition-colors"
                />
              </div>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between px-3 py-2 h-auto text-muted-foreground hover:text-foreground hover:bg-surface-secondary rounded-lg"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <Settings className="w-4 h-4" />
                      Настройки аудио
                    </span>
                    <ChevronDown className="w-4 h-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <AudioSettings onDevicesChange={handleDevicesChange} />
                </CollapsibleContent>
              </Collapsible>

              <Button
                className="w-full h-11 bg-primary btn-primary-hover text-primary-foreground font-medium shadow-soft transition-all hover:shadow-soft-lg"
                onClick={createRoom}
                disabled={!roomName.trim() || !userName.trim() || isLoading}
              >
                <Users className="w-4 h-4 mr-2" />
                {isLoading ? 'Создание...' : 'Создать встречу'}
                {!isLoading && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
