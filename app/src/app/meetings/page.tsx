'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Calendar, Users, Clock, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Meeting {
  id: string
  roomId: string
  startedAt: string
  endedAt: string | null
  status: 'IN_PROGRESS' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  room: {
    name: string
  }
  participants: Array<{
    id: string
    name: string
  }>
  _count: {
    utterances: number
    recordings: number
  }
}

const statusLabels = {
  IN_PROGRESS: 'В процессе',
  PROCESSING: 'Обработка',
  COMPLETED: 'Завершена',
  FAILED: 'Ошибка',
}

const statusIcons = {
  IN_PROGRESS: Loader2,
  PROCESSING: Loader2,
  COMPLETED: CheckCircle,
  FAILED: AlertCircle,
}

const statusColors = {
  IN_PROGRESS: 'text-blue-500',
  PROCESSING: 'text-yellow-500',
  COMPLETED: 'text-green-500',
  FAILED: 'text-red-500',
}

export default function MeetingsPage() {
  const router = useRouter()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetchMeetings()
  }, [filter])

  const fetchMeetings = async () => {
    setIsLoading(true)
    try {
      const url = filter === 'all' ? '/api/meetings' : `/api/meetings?status=${filter}`
      const res = await fetch(url)
      const data = await res.json()
      setMeetings(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch meetings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'В процессе'
    const startDate = new Date(start)
    const endDate = new Date(end)
    const diffMs = endDate.getTime() - startDate.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 60) {
      return `${diffMins} мин`
    }
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return `${hours} ч ${mins} мин`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <Button variant="ghost" onClick={() => router.push('/')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            На главную
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">История встреч</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Просмотр записей, транскриптов и резюме прошедших встреч
          </p>
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="COMPLETED">Завершённые</TabsTrigger>
            <TabsTrigger value="PROCESSING">В обработке</TabsTrigger>
            <TabsTrigger value="IN_PROGRESS">Активные</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : meetings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">Встречи не найдены</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {meetings.map((meeting) => {
              const StatusIcon = statusIcons[meeting.status]
              return (
                <Card
                  key={meeting.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/meetings/${meeting.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{meeting.room.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(meeting.startedAt)}
                        </CardDescription>
                      </div>
                      <div className={cn('flex items-center gap-1', statusColors[meeting.status])}>
                        <StatusIcon
                          className={cn(
                            'w-4 h-4',
                            (meeting.status === 'IN_PROGRESS' || meeting.status === 'PROCESSING') &&
                              'animate-spin'
                          )}
                        />
                        <span className="text-sm font-medium">{statusLabels[meeting.status]}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {meeting.participants.length} участник(ов)
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDuration(meeting.startedAt, meeting.endedAt)}
                      </div>
                      {meeting._count.utterances > 0 && (
                        <div className="text-primary">
                          {meeting._count.utterances} фраз в транскрипте
                        </div>
                      )}
                    </div>
                    {meeting.participants.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {meeting.participants.map((p) => (
                          <span
                            key={p.id}
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs"
                          >
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
