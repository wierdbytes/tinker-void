'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowLeft, Calendar, Users, Clock, Loader2 } from 'lucide-react'

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

// Group utterances by participant and sentences (or 10 second chunks)
function groupUtterances(utterances: Utterance[]): GroupedUtterance[] {
  if (utterances.length === 0) return []

  const result: GroupedUtterance[] = []
  let currentGroup: GroupedUtterance | null = null

  for (const utterance of utterances) {
    const endsWithSentence = /[.!?]$/.test(utterance.text.trim())

    // Start new group if:
    // 1. No current group
    // 2. Different participant
    // 3. Gap > 10 seconds from group start
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
    } else {
      // Append to current group
      currentGroup.text += ' ' + utterance.text
      currentGroup.endTime = utterance.endTime
    }

    // End group if sentence ends (but continue if within 10 seconds)
    if (endsWithSentence && currentGroup) {
      result.push(currentGroup)
      currentGroup = null
    }
  }

  // Don't forget the last group
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
}

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
  const participantColors: Record<string, string> = {}
  const colors = [
    'bg-blue-100 text-blue-800',
    'bg-green-100 text-green-800',
    'bg-purple-100 text-purple-800',
    'bg-orange-100 text-orange-800',
    'bg-pink-100 text-pink-800',
    'bg-teal-100 text-teal-800',
  ]

  meeting?.participants.forEach((p, i) => {
    participantColors[p.id] = colors[i % colors.length]
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6 text-center">
          <p className="text-gray-500 mb-4">Встреча не найдена</p>
          <Button onClick={() => router.push('/meetings')}>Вернуться к списку</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => router.push('/meetings')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            К списку встреч
          </Button>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{meeting.room.name}</h1>

          <div className="flex flex-wrap items-center gap-6 mt-4 text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {formatDate(meeting.startedAt)}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {formatDuration(meeting.startedAt, meeting.endedAt)}
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {meeting.participants.length} участников
            </div>
          </div>

          {/* Participants */}
          <div className="flex flex-wrap gap-2 mt-4">
            {meeting.participants.map((p) => (
              <span
                key={p.id}
                className={`px-3 py-1 rounded-full text-sm font-medium ${participantColors[p.id]}`}
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>

        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle>Транскрипт</CardTitle>
          </CardHeader>
          <CardContent>
            {meeting.utterances.length > 0 ? (
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {groupUtterances(meeting.utterances).map((utterance) => (
                    <div key={utterance.id} className="flex gap-4">
                      <div className="text-xs text-gray-400 font-mono w-12 flex-shrink-0 pt-1">
                        {formatTime(utterance.startTime)}
                      </div>
                      <div className="flex-1">
                        <div
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-1 ${
                            participantColors[utterance.participant.id]
                          }`}
                        >
                          {utterance.participant.name}
                        </div>
                        <p className="text-gray-800 dark:text-gray-200">{utterance.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : meeting.status === 'PROCESSING' ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Транскрипт формируется...</span>
              </div>
            ) : (
              <p className="text-gray-500">Транскрипт недоступен</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
