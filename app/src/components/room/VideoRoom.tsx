'use client'

import { useCallback, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useTracks,
  useRoomContext,
  VideoTrack,
} from '@livekit/components-react'
import { Track, RoomOptions } from 'livekit-client'
import '@livekit/components-styles'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AudioSettings } from '@/components/audio'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Mic, MicOff, PhoneOff, Users, Copy, Check, Settings, Waves, Monitor, MonitorOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoRoomProps {
  token: string
  serverUrl: string
  roomId: string
  participantName: string
  onLeave: () => void
  audioInputDeviceId?: string
  audioOutputDeviceId?: string
}

export function VideoRoom({
  token,
  serverUrl,
  roomId,
  participantName,
  onLeave,
  audioInputDeviceId,
  audioOutputDeviceId,
}: VideoRoomProps) {
  const roomOptions: RoomOptions = {
    audioCaptureDefaults: {
      deviceId: audioInputDeviceId || undefined,
    },
    audioOutput: {
      deviceId: audioOutputDeviceId || undefined,
    },
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={onLeave}
      options={roomOptions}
      className="h-full"
    >
      <RoomContent roomId={roomId} participantName={participantName} onLeave={onLeave} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

interface RoomContentProps {
  roomId: string
  participantName: string
  onLeave: () => void
}

function RoomContent({ roomId, participantName, onLeave }: RoomContentProps) {
  const room = useRoomContext()
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant()
  const participants = useParticipants()
  const [isMuted, setIsMuted] = useState(false)
  const [copied, setCopied] = useState(false)

  const screenShareTracks = useTracks(
    [Track.Source.ScreenShare, Track.Source.ScreenShareAudio],
    { onlySubscribed: true }
  )
  const activeScreenShare = screenShareTracks.find(
    track => track.source === Track.Source.ScreenShare
  )
  const screenShareParticipant = activeScreenShare?.participant

  const toggleMute = useCallback(async () => {
    if (localParticipant) {
      await localParticipant.setMicrophoneEnabled(isMuted)
      setIsMuted(!isMuted)
    }
  }, [localParticipant, isMuted])

  const copyRoomLink = useCallback(() => {
    const url = `${window.location.origin}/room/${roomId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [roomId])

  const toggleScreenShare = useCallback(async () => {
    if (localParticipant) {
      try {
        await localParticipant.setScreenShareEnabled(!isScreenShareEnabled)
      } catch (error) {
        console.error('Failed to toggle screen share:', error)
      }
    }
  }, [localParticipant, isScreenShareEnabled])

  const handleLeave = useCallback(() => {
    room.disconnect()
    onLeave()
  }, [room, onLeave])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Waves className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">
                {roomId.slice(0, 8)}...
              </h1>
              <p className="text-xs text-muted-foreground">В эфире</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copyRoomLink}
            className="h-8 text-xs border-border/50 hover:bg-surface-secondary"
          >
            {copied ? <Check className="w-3 h-3 mr-1.5" /> : <Copy className="w-3 h-3 mr-1.5" />}
            {copied ? 'Скопировано' : 'Ссылка'}
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">{participants.length}</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeScreenShare ? (
          /* Layout with Screen Share */
          <div className="flex h-full gap-4 p-4">
            {/* Screen Share - Main Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Presenter Info */}
              <div className="flex items-center gap-2 mb-3 px-2">
                <Monitor className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {screenShareParticipant?.name || screenShareParticipant?.identity}
                  {screenShareParticipant?.identity === localParticipant?.identity && ' (вы)'}
                </span>
                <span className="text-xs text-muted-foreground">делится экраном</span>
              </div>
              {/* Video Container */}
              <div className="flex-1 relative bg-black rounded-2xl overflow-hidden shadow-soft-lg">
                <VideoTrack
                  trackRef={activeScreenShare}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
            {/* Participants Sidebar */}
            <div className="w-48 lg:w-56 flex-shrink-0 overflow-y-auto">
              <div className="flex flex-col gap-3">
                {participants.map((participant) => (
                  <ParticipantTileCompact
                    key={participant.identity}
                    participant={participant}
                    isLocal={participant.identity === localParticipant?.identity}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Normal Grid Layout */
          <div className="p-6 overflow-auto h-full">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 max-w-7xl mx-auto">
              {participants.map((participant) => (
                <ParticipantTile
                  key={participant.identity}
                  participant={participant}
                  isLocal={participant.identity === localParticipant?.identity}
                />
              ))}
            </div>

            {/* Empty state */}
            {participants.length === 1 && (
              <div className="text-center mt-12 text-muted-foreground">
                <p className="text-sm">Вы единственный участник</p>
                <p className="text-xs mt-1">Поделитесь ссылкой, чтобы пригласить других</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-6 py-5 border-t border-border/50 bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-center gap-4">
          {/* Mute Button */}
          <Button
            variant={isMuted ? 'destructive' : 'ghost'}
            size="icon"
            onClick={toggleMute}
            className={cn(
              'w-14 h-14 rounded-full transition-all duration-200 hover:scale-105 active:scale-95',
              isMuted
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-zinc-700 hover:bg-zinc-600'
            )}
            title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          >
            {isMuted ? (
              <MicOff className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-white" />
            )}
          </Button>

          {/* Screen Share Button */}
          <Button
            variant={isScreenShareEnabled ? 'default' : 'ghost'}
            size="icon"
            onClick={toggleScreenShare}
            className={cn(
              'w-14 h-14 rounded-full transition-all duration-200 hover:scale-105 active:scale-95',
              isScreenShareEnabled
                ? 'bg-primary hover:bg-primary/90'
                : 'bg-zinc-700 hover:bg-zinc-600'
            )}
            title={isScreenShareEnabled ? 'Остановить показ экрана' : 'Поделиться экраном'}
          >
            {isScreenShareEnabled ? (
              <MonitorOff className="w-6 h-6 text-white" />
            ) : (
              <Monitor className="w-6 h-6 text-white" />
            )}
          </Button>

          {/* Settings Button */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-14 h-14 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-all duration-200 hover:scale-105 active:scale-95"
                title="Настройки аудио"
              >
                <Settings className="w-6 h-6 text-white" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-card border-border/50 shadow-soft-lg">
              <AudioSettings room={room} compact />
            </PopoverContent>
          </Popover>

          {/* Leave Button */}
          <Button
            variant="destructive"
            size="icon"
            onClick={handleLeave}
            className="w-14 h-14 rounded-full bg-destructive hover:bg-destructive/90 transition-all duration-200 hover:scale-105 active:scale-95"
            title="Покинуть встречу"
          >
            <PhoneOff className="w-6 h-6 text-white" />
          </Button>
        </div>
      </div>
    </div>
  )
}

interface ParticipantTileProps {
  participant: any
  isLocal: boolean
}

// Avatar colors - softer, modern palette
const avatarColors = [
  'from-teal-400 to-cyan-500',
  'from-violet-400 to-purple-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-emerald-400 to-green-500',
  'from-blue-400 to-indigo-500',
]

function getAvatarColor(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return avatarColors[hash % avatarColors.length]
}

function ParticipantTile({ participant, isLocal }: ParticipantTileProps) {
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: false })
  const audioTrack = tracks.find(
    (t) => t.participant.identity === participant.identity && t.source === Track.Source.Microphone
  )

  const isSpeaking = participant.isSpeaking
  const isMuted = !audioTrack?.publication?.isMuted === false
  const avatarColor = getAvatarColor(participant.name || participant.identity)

  return (
    <div
      className={cn(
        'relative flex flex-col items-center p-5 pb-4 rounded-2xl bg-card border-2 transition-all duration-300 overflow-hidden',
        isSpeaking
          ? 'border-primary shadow-soft-lg pulse-glow'
          : 'border-border/30 shadow-soft',
        isLocal && 'border-primary/50'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white mb-3 shadow-soft bg-gradient-to-br transition-transform duration-300',
          avatarColor,
          isSpeaking && 'scale-105'
        )}
      >
        {participant.name?.charAt(0)?.toUpperCase() || '?'}
      </div>

      {/* Name */}
      <p className="text-foreground font-medium text-center truncate max-w-full text-sm mb-3">
        {participant.name || participant.identity}
        {isLocal && <span className="text-muted-foreground ml-1">(вы)</span>}
      </p>

      {/* Speaking indicator - always visible area */}
      <div className="flex items-end justify-center gap-0.5 h-4 w-full">
        {isSpeaking ? (
          <>
            <span className="w-1 bg-primary rounded-full sound-wave" style={{ height: '40%' }} />
            <span className="w-1 bg-primary rounded-full sound-wave sound-wave-delay-1" style={{ height: '80%' }} />
            <span className="w-1 bg-primary rounded-full sound-wave sound-wave-delay-2" style={{ height: '100%' }} />
            <span className="w-1 bg-primary rounded-full sound-wave sound-wave-delay-3" style={{ height: '60%' }} />
            <span className="w-1 bg-primary rounded-full sound-wave" style={{ height: '30%' }} />
          </>
        ) : (
          <>
            <span className="w-1 h-1 bg-muted-foreground/30 rounded-full" />
            <span className="w-1 h-1.5 bg-muted-foreground/30 rounded-full" />
            <span className="w-1 h-2 bg-muted-foreground/30 rounded-full" />
            <span className="w-1 h-1.5 bg-muted-foreground/30 rounded-full" />
            <span className="w-1 h-1 bg-muted-foreground/30 rounded-full" />
          </>
        )}
      </div>

      {/* Mute indicator */}
      {isMuted && (
        <div className="absolute top-3 right-3 p-1.5 bg-destructive rounded-lg shadow-soft">
          <MicOff className="w-3 h-3 text-destructive-foreground" />
        </div>
      )}
    </div>
  )
}

function ParticipantTileCompact({ participant, isLocal }: ParticipantTileProps) {
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: false })
  const audioTrack = tracks.find(
    (t) => t.participant.identity === participant.identity && t.source === Track.Source.Microphone
  )

  const isSpeaking = participant.isSpeaking
  const isMuted = !audioTrack?.publication?.isMuted === false
  const avatarColor = getAvatarColor(participant.name || participant.identity)

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 p-3 rounded-xl bg-card border transition-all duration-300',
        isSpeaking
          ? 'border-primary shadow-soft pulse-glow'
          : 'border-border/30 shadow-soft',
        isLocal && 'border-primary/50'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0 bg-gradient-to-br transition-transform duration-300',
          avatarColor,
          isSpeaking && 'scale-105'
        )}
      >
        {participant.name?.charAt(0)?.toUpperCase() || '?'}
      </div>

      {/* Name and indicators */}
      <div className="flex-1 min-w-0">
        <p className="text-foreground font-medium text-sm truncate">
          {participant.name || participant.identity}
          {isLocal && <span className="text-muted-foreground ml-1">(вы)</span>}
        </p>
        {/* Speaking indicator */}
        <div className="flex items-end gap-0.5 h-3 mt-1">
          {isSpeaking ? (
            <>
              <span className="w-0.5 bg-primary rounded-full sound-wave" style={{ height: '40%' }} />
              <span className="w-0.5 bg-primary rounded-full sound-wave sound-wave-delay-1" style={{ height: '80%' }} />
              <span className="w-0.5 bg-primary rounded-full sound-wave sound-wave-delay-2" style={{ height: '100%' }} />
              <span className="w-0.5 bg-primary rounded-full sound-wave sound-wave-delay-3" style={{ height: '60%' }} />
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {isMuted ? 'Без звука' : 'Готов'}
            </span>
          )}
        </div>
      </div>

      {/* Mute indicator */}
      {isMuted && (
        <div className="p-1 bg-destructive rounded-lg flex-shrink-0">
          <MicOff className="w-3 h-3 text-destructive-foreground" />
        </div>
      )}
    </div>
  )
}
