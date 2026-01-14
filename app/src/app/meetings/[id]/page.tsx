'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ArrowLeft, Calendar, Users, Clock, Loader2, Waves, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { MeetingPlayer } from '@/components/player/MeetingPlayer'

interface Participant {
  id: string
  name: string
  identity: string
}

interface Utterance {
  id: string
  text: string
  startTime: number
  endTime: number
  participant: Participant
}

interface GroupedUtterance {
  id: string
  text: string
  startTime: number
  endTime: number
  participant: Participant
}

interface Recording {
  id: string
  fileUrl: string
  duration: number
  participant: Participant
}

function groupUtterances(utterances: Utterance[]): GroupedUtterance[] {
  if (utterances.length === 0) return []

  const result: GroupedUtterance[] = []
  let currentGroup: GroupedUtterance | null = null

  for (const utterance of utterances) {
    const endsWithSentence = /[.!?]$/.test(utterance.text.trim())

    const shouldStartNew =
      !currentGroup ||
      currentGroup.participant.id !== utterance.participant.id ||
      utterance.startTime - currentGroup.startTime > 10

    if (shouldStartNew) {
      if (currentGroup) {
        result.push(currentGroup)
      }
      currentGroup = {
        id: utterance.id,
        text: utterance.text,
        startTime: utterance.startTime,
        endTime: utterance.endTime,
        participant: utterance.participant,
      }
    } else if (currentGroup) {
      currentGroup.text += ' ' + utterance.text
      currentGroup.endTime = utterance.endTime
    }

    if (endsWithSentence && currentGroup) {
      result.push(currentGroup)
      currentGroup = null
    }
  }

  if (currentGroup) {
    result.push(currentGroup)
  }

  return result
}

interface Meeting {
  id: string
  startedAt: string
  endedAt: string | null
  status: string
  room: {
    name: string
  }
  participants: Participant[]
  utterances: Utterance[]
  recordings: Recording[]
}

// Modern gradient pairs for participants
const participantGradients = [
  { bg: 'bg-gradient-to-r from-teal-500/10 to-cyan-500/10', text: 'text-teal-600 dark:text-teal-400', badge: 'bg-teal-500' },
  { bg: 'bg-gradient-to-r from-violet-500/10 to-purple-500/10', text: 'text-violet-600 dark:text-violet-400', badge: 'bg-violet-500' },
  { bg: 'bg-gradient-to-r from-rose-500/10 to-pink-500/10', text: 'text-rose-600 dark:text-rose-400', badge: 'bg-rose-500' },
  { bg: 'bg-gradient-to-r from-amber-500/10 to-orange-500/10', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-500' },
  { bg: 'bg-gradient-to-r from-emerald-500/10 to-green-500/10', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-500' },
  { bg: 'bg-gradient-to-r from-blue-500/10 to-indigo-500/10', text: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-500' },
]

export default function MeetingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const meetingId = params.id as string

  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchMeeting()
  }, [meetingId])

  const fetchMeeting = async () => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`)
      if (res.ok) {
        const data = await res.json()
        setMeeting(data)
      }
    } catch (error) {
      console.error('Failed to fetch meeting:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
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
      return `${diffMins} минут`
    }
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return `${hours} ч ${mins} мин`
  }

  // Generate participant colors
  const participantStyles: Record<string, typeof participantGradients[0]> = {}
  meeting?.participants.forEach((p, i) => {
    participantStyles[p.id] = participantGradients[i % participantGradients.length]
  })

  // Audio player hook
  const player = useAudioPlayer(meeting?.recordings, meeting?.startedAt)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-sm w-full border-border/50 shadow-soft">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-secondary flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-4">Встреча не найдена</p>
            <Button onClick={() => router.push('/meetings')}>Вернуться к списку</Button>
          </CardContent>
        </Card>
      </div>
    )
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/meetings')}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            К списку
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Meeting header */}
          <section className="mb-8 fade-in-up">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Waves className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-foreground truncate">{meeting.room.name}</h1>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{formatDate(meeting.startedAt)}</span>
                </div>
              </div>
            </div>

            {/* Meeting stats */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>{formatDuration(meeting.startedAt, meeting.endedAt)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary">
                <Users className="w-4 h-4 flex-shrink-0" />
                <span>{meeting.participants.length} участников</span>
              </div>
              {meeting.utterances.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary">
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span>{meeting.utterances.length} фраз</span>
                </div>
              )}
            </div>

            {/* Participants */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/30">
              {meeting.participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-secondary"
                >
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', participantStyles[p.id]?.badge)} />
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Audio Player */}
          {meeting.recordings && meeting.recordings.length > 0 && (
            <section className="mb-8 fade-in-up fade-in-delay-1">
              <MeetingPlayer player={player} participantStyles={participantStyles} />
            </section>
          )}

          {/* Transcript */}
          <Card className="border-border/50 shadow-soft fade-in-up fade-in-delay-2 overflow-hidden">
            <CardContent className="p-0">
              <div className="px-6 py-4 border-b border-border/50 bg-card">
                <h2 className="font-semibold text-foreground">Транскрипт</h2>
              </div>

              {meeting.utterances.length > 0 ? (
                <ScrollArea className="h-[600px]">
                  <div className="p-6 space-y-4">
                    {groupUtterances(meeting.utterances).map((utterance) => {
                      const style = participantStyles[utterance.participant.id]
                      return (
                        <div
                          key={utterance.id}
                          onClick={() => player.seek(utterance.startTime)}
                          className={cn(
                            'flex gap-4 p-4 rounded-xl transition-all cursor-pointer hover:scale-[1.01] hover:shadow-md',
                            style?.bg
                          )}
                        >
                          <div className="text-xs text-muted-foreground font-mono w-12 flex-shrink-0 pt-0.5">
                            {formatTime(utterance.startTime)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className={cn('w-1.5 h-1.5 rounded-full', style?.badge)} />
                              <span className={cn('text-sm font-medium', style?.text)}>
                                {utterance.participant.name}
                              </span>
                            </div>
                            <p className="text-foreground leading-relaxed">
                              {utterance.text}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              ) : meeting.status === 'PROCESSING' ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Транскрипт формируется...</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-surface-secondary flex items-center justify-center">
                      <FileText className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Транскрипт недоступен</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
