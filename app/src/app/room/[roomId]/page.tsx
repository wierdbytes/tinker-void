'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { VideoRoom } from '@/components/room/VideoRoom'
import { AudioSettings } from '@/components/audio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Loader2, Settings, ChevronDown } from 'lucide-react'

interface AudioDevices {
  audioInputDeviceId: string
  audioOutputDeviceId: string
}

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomId = params.roomId as string
  const nameFromUrl = searchParams.get('name')

  const [token, setToken] = useState<string | null>(null)
  const [userName, setUserName] = useState(nameFromUrl || '')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioDevices, setAudioDevices] = useState<AudioDevices>({
    audioInputDeviceId: '',
    audioOutputDeviceId: '',
  })
  const joinAttemptedRef = useRef(false)

  const handleDevicesSelected = useCallback((devices: AudioDevices) => {
    setAudioDevices(devices)
  }, [])

  // Auto-join if name is provided in URL
  useEffect(() => {
    if (nameFromUrl && !token && !joinAttemptedRef.current) {
      joinAttemptedRef.current = true
      joinRoom(nameFromUrl)
    }
  }, [nameFromUrl])

  const joinRoom = async (name: string) => {
    if (!name.trim() || isJoining) return

    setIsJoining(true)
    setError(null)

    try {
      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          participantName: name,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to join room')
      }

      const data = await res.json()
      setToken(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room')
      setIsJoining(false)
    }
  }

  const handleLeave = () => {
    setToken(null)
    router.push('/')
  }

  // Show lobby if no token yet
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Присоединиться к встрече</CardTitle>
            <CardDescription>
              Комната: {roomId.slice(0, 8)}...
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Ваше имя</Label>
              <Input
                id="name"
                placeholder="Введите ваше имя"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom(userName)}
                disabled={isJoining}
              />
            </div>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-4 py-2 h-auto">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Settings className="w-4 h-4" />
                    Настройки аудио
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <AudioSettings onDevicesChange={handleDevicesSelected} className="mt-2" />
              </CollapsibleContent>
            </Collapsible>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <Button
              className="w-full"
              onClick={() => joinRoom(userName)}
              disabled={!userName.trim() || isJoining}
            >
              {isJoining ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Подключение...
                </>
              ) : (
                'Присоединиться'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show room
  return (
    <div className="h-screen">
      <VideoRoom
        token={token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880'}
        roomId={roomId}
        participantName={userName}
        onLeave={handleLeave}
        audioInputDeviceId={audioDevices.audioInputDeviceId}
        audioOutputDeviceId={audioDevices.audioOutputDeviceId}
      />
    </div>
  )
}
