'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  ArrowLeft,
  Calendar,
  Users,
  Clock,
  CheckCircle,
  Loader2,
  AlertCircle,
  FileText,
  Waves,
  Radio,
} from 'lucide-react'
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

const statusConfig = {
  IN_PROGRESS: {
    label: 'В процессе',
    icon: Radio,
    color: 'text-primary',
    bg: 'bg-primary/10',
    animate: true,
  },
  PROCESSING: {
    label: 'Обработка',
    icon: Loader2,
    color: 'text-warning',
    bg: 'bg-warning/10',
    animate: true,
  },
  COMPLETED: {
    label: 'Завершена',
    icon: CheckCircle,
    color: 'text-success',
    bg: 'bg-success/10',
    animate: false,
  },
  FAILED: {
    label: 'Ошибка',
    icon: AlertCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    animate: false,
  },
}

const filterTabs = [
  { value: 'all', label: 'Все' },
  { value: 'COMPLETED', label: 'Завершённые' },
  { value: 'PROCESSING', label: 'В обработке' },
  { value: 'IN_PROGRESS', label: 'Активные' },
]

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
    <div className="min-h-screen bg-background relative">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-primary/5 to-accent/5 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 px-6 py-4 border-b border-border/50 bg-card/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/')}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад
            </Button>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Page header */}
          <section className="mb-8 fade-in-up">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Waves className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-foreground">История встреч</h1>
                <p className="text-muted-foreground mt-1">
                  Записи, транскрипты и резюме прошедших встреч
                </p>
              </div>
            </div>
          </section>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-1 px-1 fade-in-up fade-in-delay-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                  filter === tab.value
                    ? 'bg-primary text-primary-foreground shadow-soft'
                    : 'bg-surface-secondary text-muted-foreground hover:text-foreground hover:bg-surface-tertiary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Meetings list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Загрузка...</p>
              </div>
            </div>
          ) : meetings.length === 0 ? (
            <Card className="border-border/50 shadow-soft fade-in-up">
              <CardContent className="py-16 text-center">
                <div className="w-12 h-12 rounded-xl bg-surface-secondary flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">Встречи не найдены</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {meetings.map((meeting, index) => {
                const config = statusConfig[meeting.status]
                const StatusIcon = config.icon
                return (
                  <Card
                    key={meeting.id}
                    className={cn(
                      'border-border/50 shadow-soft cursor-pointer transition-all hover:shadow-soft-lg hover:border-border fade-in-up',
                      `fade-in-delay-${Math.min(index + 1, 4)}`
                    )}
                    style={{ animationDelay: `${index * 0.05}s` }}
                    onClick={() => router.push(`/meetings/${meeting.id}`)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate mb-1">
                            {meeting.room.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(meeting.startedAt)}</span>
                          </div>
                        </div>
                        <div
                          className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
                            config.bg,
                            config.color
                          )}
                        >
                          <StatusIcon
                            className={cn('w-3.5 h-3.5', config.animate && 'animate-spin')}
                          />
                          <span>{config.label}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-5 mt-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>{meeting.participants.length}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatDuration(meeting.startedAt, meeting.endedAt)}</span>
                        </div>
                        {meeting._count.utterances > 0 && (
                          <div className="flex items-center gap-1.5 text-primary">
                            <FileText className="w-3.5 h-3.5" />
                            <span>{meeting._count.utterances} фраз</span>
                          </div>
                        )}
                      </div>

                      {meeting.participants.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-4">
                          {meeting.participants.slice(0, 5).map((p) => (
                            <span
                              key={p.id}
                              className="px-2 py-0.5 bg-surface-secondary rounded-md text-xs text-muted-foreground"
                            >
                              {p.name}
                            </span>
                          ))}
                          {meeting.participants.length > 5 && (
                            <span className="px-2 py-0.5 bg-surface-secondary rounded-md text-xs text-muted-foreground">
                              +{meeting.participants.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
