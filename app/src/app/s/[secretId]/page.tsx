'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { VideoRoom } from '@/components/room/VideoRoom'
import { AudioSettings } from '@/components/audio'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Loader2, Settings, ChevronDown, ArrowLeft, Mic, Waves, History } from 'lucide-react'

const USER_NAME_KEY = 'tinkervoid_user_name'

interface AudioDevices {
  audioInputDeviceId: string
  audioOutputDeviceId: string
}

interface RoomInfo {
  id: string
  name: string
  secretId: string
}

export default function SecretRoomPage() {
  const params = useParams()
  const router = useRouter()
  const secretId = params.secretId as string

  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [isLoadingRoom, setIsLoadingRoom] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioDevices, setAudioDevices] = useState<AudioDevices>({
    audioInputDeviceId: '',
    audioOutputDeviceId: '',
  })

  const handleDevicesSelected = useCallback((devices: AudioDevices) => {
    setAudioDevices(devices)
  }, [])

  // Load saved name and fetch room info on mount
  useEffect(() => {
    const savedName = localStorage.getItem(USER_NAME_KEY)
    if (savedName) {
      setUserName(savedName)
    }
    fetchRoomInfo()
  }, [secretId])

  const fetchRoomInfo = async () => {
    try {
      const res = await fetch(`/api/s/${secretId}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Комната не найдена')
        } else {
          setError('Ошибка загрузки')
        }
        return
      }
      const data = await res.json()
      setRoom(data)
    } catch (err) {
      setError('Ошибка соединения')
    } finally {
      setIsLoadingRoom(false)
    }
  }

  const joinRoom = async (name: string) => {
    if (!name.trim() || isJoining) return

    setIsJoining(true)
    setError(null)

    try {
      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretId,
          participantName: name,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Не удалось присоединиться')
      }

      const data = await res.json()

      // Save name to localStorage for next time
      localStorage.setItem(USER_NAME_KEY, name.trim())

      setToken(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось присоединиться')
      setIsJoining(false)
    }
  }

  const handleLeave = () => {
    setToken(null)
    setIsJoining(false)
    // Stay on the same page (don't redirect to home)
  }

  // Loading state
  if (isLoadingRoom) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  // Error state (room not found)
  if (error && !room) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-primary/5 to-accent/5 blur-3xl" />
        </div>

        <header className="relative z-10 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/')}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              На главную
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="relative z-10 px-6 py-12 flex items-center justify-center min-h-[calc(100vh-80px)]">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 mb-4">
              <Waves className="w-8 h-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">{error}</h1>
            <p className="text-muted-foreground">
              Проверьте правильность ссылки
            </p>
          </div>
        </main>
      </div>
    )
  }

  // In-call room
  if (token && room) {
    return (
      <div className="h-screen bg-background">
        <VideoRoom
          token={token}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880'}
          roomId={room.id}
          roomName={room.name}
          participantName={userName}
          onLeave={handleLeave}
          secretId={secretId}
          audioInputDeviceId={audioDevices.audioInputDeviceId}
          audioOutputDeviceId={audioDevices.audioOutputDeviceId}
        />
      </div>
    )
  }

  // Pre-join lobby
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-primary/5 to-accent/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-primary/5 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/')}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            На главную
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/s/${secretId}/history`)}
              className="text-muted-foreground hover:text-foreground"
            >
              <History className="w-4 h-4 mr-2" />
              История
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 px-6 py-12 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <div className="w-full max-w-md">
          {/* Room info */}
          <div className="text-center mb-8 fade-in-up">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 mb-4">
              <Waves className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {room?.name || 'Присоединиться к встрече'}
            </h1>
            <p className="text-muted-foreground text-sm">
              Введите имя, чтобы присоединиться
            </p>
          </div>

          {/* Join card */}
          <Card className="shadow-soft-lg border-border/50 fade-in-up fade-in-delay-1">
            <CardContent className="p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  Ваше имя
                </Label>
                <Input
                  id="name"
                  placeholder="Как вас называть?"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom(userName)}
                  disabled={isJoining}
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
                  <AudioSettings onDevicesChange={handleDevicesSelected} />
                </CollapsibleContent>
              </Collapsible>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button
                className="w-full h-11 bg-primary btn-primary-hover text-primary-foreground font-medium shadow-soft transition-all hover:shadow-soft-lg"
                onClick={() => joinRoom(userName)}
                disabled={!userName.trim() || isJoining}
              >
                {isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Подключение...
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 mr-2" />
                    Присоединиться
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
