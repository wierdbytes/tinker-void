'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AudioSettings } from '@/components/audio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Video, Users, History, Settings, ChevronDown } from 'lucide-react'

interface AudioDevices {
  audioInputDeviceId: string
  audioOutputDeviceId: string
}

export default function HomePage() {
  const router = useRouter()
  const [roomName, setRoomName] = useState('')
  const [userName, setUserName] = useState('')
  const [roomId, setRoomId] = useState('')
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

      if (data.id) {
        router.push(`/room/${data.id}?name=${encodeURIComponent(userName)}`)
      }
    } catch (error) {
      console.error('Failed to create room:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const joinRoom = () => {
    if (!roomId.trim() || !userName.trim()) return
    router.push(`/room/${roomId}?name=${encodeURIComponent(userName)}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Video className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">TinkerDesk</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Голосовые встречи с транскрибацией
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Начать встречу</CardTitle>
            <CardDescription>
              Создайте новую комнату или присоединитесь к существующей
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="create" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">Создать</TabsTrigger>
                <TabsTrigger value="join">Присоединиться</TabsTrigger>
              </TabsList>

              <TabsContent value="create" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="userName">Ваше имя</Label>
                  <Input
                    id="userName"
                    placeholder="Введите ваше имя"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roomName">Название комнаты</Label>
                  <Input
                    id="roomName"
                    placeholder="Например: Дейли стендап"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
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
                    <AudioSettings onDevicesChange={handleDevicesChange} className="mt-2" />
                  </CollapsibleContent>
                </Collapsible>
                <Button
                  className="w-full"
                  onClick={createRoom}
                  disabled={!roomName.trim() || !userName.trim() || isLoading}
                >
                  <Users className="w-4 h-4 mr-2" />
                  {isLoading ? 'Создание...' : 'Создать комнату'}
                </Button>
              </TabsContent>

              <TabsContent value="join" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="joinUserName">Ваше имя</Label>
                  <Input
                    id="joinUserName"
                    placeholder="Введите ваше имя"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roomId">ID комнаты</Label>
                  <Input
                    id="roomId"
                    placeholder="Вставьте ID комнаты"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
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
                    <AudioSettings onDevicesChange={handleDevicesChange} className="mt-2" />
                  </CollapsibleContent>
                </Collapsible>
                <Button
                  className="w-full"
                  onClick={joinRoom}
                  disabled={!roomId.trim() || !userName.trim()}
                >
                  <Video className="w-4 h-4 mr-2" />
                  Присоединиться
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={() => router.push('/meetings')}>
            <History className="w-4 h-4 mr-2" />
            История встреч
          </Button>
        </div>
      </div>
    </div>
  )
}
