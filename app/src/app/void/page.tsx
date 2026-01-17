'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  Shield,
  DoorOpen,
  Users,
  Trash2,
  Copy,
  ExternalLink,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Activity,
  Database,
  FileAudio,
  MessageSquare,
  LogOut,
  ChevronLeft,
  ArrowUpRight,
} from 'lucide-react'

// Types
interface Room {
  id: string
  name: string
  secretId: string
  createdAt: string
  meetingCount: number
  lastMeeting: {
    startedAt: string
    status: string
  } | null
}

interface Participant {
  id: string
  name: string
  identity: string
  joinedAt: string
  leftAt: string | null
  isOnline: boolean
}

interface Meeting {
  id: string
  roomId: string
  roomName: string
  roomSecretId: string
  startedAt: string
  endedAt: string | null
  status: 'IN_PROGRESS' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  participantsOnline: number
  participantsTotal: number
  participants: Participant[]
  recordingsCount: number
  utterancesCount: number
}

interface Stats {
  rooms: { total: number }
  meetings: {
    total: number
    inProgress: number
    processing: number
    completed: number
    failed: number
  }
  recordings: { total: number; transcribed: number }
  utterances: { total: number }
  participants: { total: number }
  live: { activeRooms: number; onlineParticipants: number }
}

type ViewType = 'main' | 'room-meetings' | 'active-meetings'

// Helpers
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMeetingTitle(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'только что'
  if (diffMins < 60) return `${diffMins} мин. назад`
  if (diffHours < 24) return `${diffHours} ч. назад`
  if (diffDays < 7) return `${diffDays} дн. назад`
  return formatDate(dateStr)
}

function formatDuration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt)
  const end = endedAt ? new Date(endedAt) : new Date()
  const diffMs = end.getTime() - start.getTime()
  const hours = Math.floor(diffMs / 3600000)
  const minutes = Math.floor((diffMs % 3600000) / 60000)
  if (hours > 0) return `${hours}ч ${minutes}м`
  return `${minutes}м`
}

function getStatusBadge(status: Meeting['status']) {
  const styles = {
    IN_PROGRESS: 'bg-green-500/10 text-green-500 border-green-500/20',
    PROCESSING: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    COMPLETED: 'bg-muted text-muted-foreground border-border',
    FAILED: 'bg-red-500/10 text-red-500 border-red-500/20',
  }
  const labels = {
    IN_PROGRESS: 'Идёт',
    PROCESSING: 'Обработка',
    COMPLETED: 'Завершена',
    FAILED: 'Ошибка',
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

// Main Component
export default function VoidPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [adminKey, setAdminKey] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    const savedKey = sessionStorage.getItem('void_admin_key')
    if (savedKey) {
      setAdminKey(savedKey)
      setIsAuthenticated(true)
    }
  }, [])

  const authenticate = async () => {
    if (!adminKey.trim()) return

    setIsAuthenticating(true)
    setAuthError('')

    try {
      const res = await fetch('/api/void/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: adminKey }),
      })

      if (res.ok) {
        sessionStorage.setItem('void_admin_key', adminKey)
        setIsAuthenticated(true)
      } else {
        setAuthError('Неверный ключ доступа')
      }
    } catch {
      setAuthError('Ошибка соединения')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const logout = () => {
    sessionStorage.removeItem('void_admin_key')
    setAdminKey('')
    setIsAuthenticated(false)
  }

  if (!isAuthenticated) {
    return <AuthForm
      adminKey={adminKey}
      setAdminKey={setAdminKey}
      isAuthenticating={isAuthenticating}
      authError={authError}
      onSubmit={authenticate}
    />
  }

  return <AdminPanel adminKey={adminKey} onLogout={logout} />
}

// Auth Form Component
function AuthForm({
  adminKey,
  setAdminKey,
  isAuthenticating,
  authError,
  onSubmit,
}: {
  adminKey: string
  setAdminKey: (key: string) => void
  isAuthenticating: boolean
  authError: string
  onSubmit: () => void
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-sm shadow-soft-lg border-border/50">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Void Admin</CardTitle>
          <CardDescription>Введите ключ доступа</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adminKey" className="sr-only">Ключ доступа</Label>
            <Input
              id="adminKey"
              type="password"
              placeholder="Ключ доступа"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              className="h-11"
              autoFocus
            />
          </div>

          {authError && (
            <p className="text-sm text-red-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {authError}
            </p>
          )}

          <Button
            className="w-full h-11"
            onClick={onSubmit}
            disabled={!adminKey.trim() || isAuthenticating}
          >
            {isAuthenticating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Проверка...
              </>
            ) : (
              'Войти'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// Admin Panel Component
function AdminPanel({ adminKey, onLogout }: { adminKey: string; onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteConfirmMeeting, setDeleteConfirmMeeting] = useState<string | null>(null)

  // Navigation state
  const [currentView, setCurrentView] = useState<ViewType>('main')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)

  const authHeaders = {
    'Authorization': `Bearer ${adminKey}`,
    'Content-Type': 'application/json',
  }

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/void/stats', { headers: authHeaders })
      if (res.ok) setStats(await res.json())
    } catch (e) {
      console.error('Failed to fetch stats:', e)
    }
  }, [adminKey])

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/void/rooms', { headers: authHeaders })
      if (res.ok) setRooms(await res.json())
    } catch (e) {
      console.error('Failed to fetch rooms:', e)
    }
  }, [adminKey])

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/void/meetings', { headers: authHeaders })
      if (res.ok) setMeetings(await res.json())
    } catch (e) {
      console.error('Failed to fetch meetings:', e)
    }
  }, [adminKey])

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([fetchStats(), fetchRooms(), fetchMeetings()])
    setIsLoading(false)
  }, [fetchStats, fetchRooms, fetchMeetings])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const deleteRoom = async (roomId: string) => {
    try {
      const res = await fetch('/api/void/rooms', {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify({ id: roomId }),
      })
      if (res.ok) {
        setRooms(rooms.filter(r => r.id !== roomId))
        setDeleteConfirm(null)
        fetchStats()
        if (selectedRoom?.id === roomId) {
          setCurrentView('main')
          setSelectedRoom(null)
        }
      }
    } catch (e) {
      console.error('Failed to delete room:', e)
    }
  }

  const deleteMeeting = async (meetingId: string) => {
    try {
      const res = await fetch('/api/void/meetings', {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify({ id: meetingId }),
      })
      if (res.ok) {
        setMeetings(meetings.filter(m => m.id !== meetingId))
        setDeleteConfirmMeeting(null)
        fetchStats()
      }
    } catch (e) {
      console.error('Failed to delete meeting:', e)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const openRoomMeetings = (room: Room) => {
    setSelectedRoom(room)
    setCurrentView('room-meetings')
  }

  const openActiveMeetings = () => {
    setCurrentView('active-meetings')
  }

  const goBack = () => {
    setCurrentView('main')
    setSelectedRoom(null)
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  // Filter meetings for selected room
  const roomMeetings = selectedRoom
    ? meetings.filter(m => m.roomId === selectedRoom.id)
    : []

  // Filter active meetings
  const activeMeetings = meetings.filter(m => m.status === 'IN_PROGRESS')

  // Render sub-views
  if (currentView === 'room-meetings' && selectedRoom) {
    return (
      <SubPageLayout
        title={selectedRoom.name}
        onBack={goBack}
        onRefresh={refreshAll}
        isLoading={isLoading}
        onLogout={onLogout}
      >
        <MeetingsList
          meetings={roomMeetings}
          showRoomName={false}
          onDelete={deleteMeeting}
          deleteConfirm={deleteConfirmMeeting}
          setDeleteConfirm={setDeleteConfirmMeeting}
        />
      </SubPageLayout>
    )
  }

  if (currentView === 'active-meetings') {
    return (
      <SubPageLayout
        title="Активные встречи"
        onBack={goBack}
        onRefresh={refreshAll}
        isLoading={isLoading}
        onLogout={onLogout}
      >
        <MeetingsList
          meetings={activeMeetings}
          showRoomName={true}
          onDelete={deleteMeeting}
          deleteConfirm={deleteConfirmMeeting}
          setDeleteConfirm={setDeleteConfirmMeeting}
        />
      </SubPageLayout>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <h1 className="font-semibold text-lg">Void Admin</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshAll}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={onLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="w-4 h-4" />
              Обзор
            </TabsTrigger>
            <TabsTrigger value="rooms" className="gap-2">
              <DoorOpen className="w-4 h-4" />
              Комнаты
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={Activity}
                  label="Онлайн"
                  value={stats.live.onlineParticipants}
                  sublabel={`${stats.live.activeRooms} активных комнат`}
                  highlight
                  onClick={stats.live.activeRooms > 0 ? openActiveMeetings : undefined}
                />
                <StatCard
                  icon={DoorOpen}
                  label="Комнаты"
                  value={stats.rooms.total}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Встречи"
                  value={stats.meetings.total}
                  sublabel={`${stats.meetings.inProgress} идёт`}
                />
                <StatCard
                  icon={Users}
                  label="Участники"
                  value={stats.participants.total}
                />
                <StatCard
                  icon={FileAudio}
                  label="Записи"
                  value={stats.recordings.total}
                  sublabel={`${stats.recordings.transcribed} расшифровано`}
                />
                <StatCard
                  icon={MessageSquare}
                  label="Фразы"
                  value={stats.utterances.total}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Завершено"
                  value={stats.meetings.completed}
                />
                <StatCard
                  icon={AlertCircle}
                  label="Ошибки"
                  value={stats.meetings.failed}
                  error={stats.meetings.failed > 0}
                />
              </div>
            ) : null}
          </TabsContent>

          {/* Rooms Tab */}
          <TabsContent value="rooms">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Комнаты не найдены
              </div>
            ) : (
              <div className="space-y-3">
                {rooms.map(room => (
                  <Card key={room.id} className="hover:bg-muted/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              onClick={() => openRoomMeetings(room)}
                              className="font-medium truncate hover:text-primary hover:underline transition-colors text-left"
                            >
                              {room.name}
                            </button>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                              {room.meetingCount} встреч
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Создана: {formatDate(room.createdAt)}</span>
                            </div>
                            {room.lastMeeting && (
                              <div className="flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5" />
                                <span>Последняя: {formatRelativeTime(room.lastMeeting.startedAt)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 font-mono text-xs">
                              <Database className="w-3.5 h-3.5" />
                              <span className="truncate">{room.secretId}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => copyToClipboard(`${appUrl}/s/${room.secretId}`)}
                            title="Копировать ссылку"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            asChild
                          >
                            <a href={`/s/${room.secretId}`} target="_blank" rel="noopener noreferrer" title="Открыть">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                          {deleteConfirm === room.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => deleteRoom(room.id)}
                              >
                                Удалить
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => setDeleteConfirm(null)}
                              >
                                Отмена
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-red-500"
                              onClick={() => setDeleteConfirm(room.id)}
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

// Sub Page Layout
function SubPageLayout({
  title,
  onBack,
  onRefresh,
  isLoading,
  onLogout,
  children,
}: {
  title: string
  onBack: () => void
  onRefresh: () => void
  isLoading: boolean
  onLogout: () => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h1 className="font-semibold text-lg truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={onLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}

// Meetings List Component
function MeetingsList({
  meetings,
  showRoomName,
  onDelete,
  deleteConfirm,
  setDeleteConfirm,
}: {
  meetings: Meeting[]
  showRoomName: boolean
  onDelete: (id: string) => void
  deleteConfirm: string | null
  setDeleteConfirm: (id: string | null) => void
}) {
  if (meetings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Встречи не найдены
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {meetings.map(meeting => (
        <Card key={meeting.id} className="hover:bg-muted/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <a
                    href={`/m/${meeting.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:text-primary hover:underline transition-colors flex items-center gap-1.5"
                  >
                    {formatMeetingTitle(meeting.startedAt)}
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                  {getStatusBadge(meeting.status)}
                </div>
                {showRoomName && (
                  <div className="text-sm text-muted-foreground mb-2">
                    <span className="font-medium">{meeting.roomName}</span>
                  </div>
                )}
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {meeting.participantsOnline}/{meeting.participantsTotal}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDuration(meeting.startedAt, meeting.endedAt)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <FileAudio className="w-3.5 h-3.5" />
                      {meeting.recordingsCount}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {meeting.utterancesCount}
                    </span>
                  </div>
                  {meeting.endedAt && (
                    <div className="text-xs text-muted-foreground/70">
                      Завершена: {formatDate(meeting.endedAt)}
                    </div>
                  )}
                </div>
                {meeting.participants.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {meeting.participants.map(p => (
                      <span
                        key={p.id}
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          p.isOnline
                            ? 'bg-green-500/10 text-green-500'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {deleteConfirm === meeting.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => onDelete(meeting.id)}
                    >
                      Удалить
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setDeleteConfirm(null)}
                    >
                      Отмена
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                    onClick={() => setDeleteConfirm(meeting.id)}
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Stat Card Component
function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  highlight,
  error,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: number
  sublabel?: string
  highlight?: boolean
  error?: boolean
  onClick?: () => void
}) {
  const cardClasses = `${
    highlight ? 'border-primary/30 bg-primary/5' :
    error ? 'border-red-500/30 bg-red-500/5' : ''
  } ${onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`

  return (
    <Card className={cardClasses} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            highlight ? 'bg-primary/10 text-primary' :
            error ? 'bg-red-500/10 text-red-500' :
            'bg-muted text-muted-foreground'
          }`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold">{value.toLocaleString('ru-RU')}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sublabel && <p className="text-xs text-muted-foreground/70">{sublabel}</p>}
          </div>
          {onClick && (
            <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
