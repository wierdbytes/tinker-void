'use client'

import { useCallback, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useTracks,
  useRoomContext,
} from '@livekit/components-react'
import { Track, RoomOptions } from 'livekit-client'
import '@livekit/components-styles'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AudioSettings } from '@/components/audio'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Mic, MicOff, PhoneOff, Users, Copy, Check, Settings, Waves } from 'lucide-react'
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
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const [isMuted, setIsMuted] = useState(false)
  const [copied, setCopied] = useState(false)

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

      {/* Participants Grid */}
      <div className="flex-1 p-6 overflow-auto">
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

      {/* Controls */}
      <div className="px-6 py-5 border-t border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
          <Button
            variant={isMuted ? 'destructive' : 'secondary'}
            size="lg"
            onClick={toggleMute}
            className={cn(
              'rounded-full w-14 h-14 shadow-soft transition-all hover:shadow-soft-lg',
              !isMuted && 'bg-surface-secondary hover:bg-surface-tertiary'
            )}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                size="lg"
                className="rounded-full w-14 h-14 bg-surface-secondary hover:bg-surface-tertiary shadow-soft transition-all hover:shadow-soft-lg"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-card border-border/50 shadow-soft-lg">
              <AudioSettings room={room} compact />
            </PopoverContent>
          </Popover>

          <Button
            variant="destructive"
            size="lg"
            onClick={handleLeave}
            className="rounded-full w-14 h-14 shadow-soft transition-all hover:shadow-soft-lg"
          >
            <PhoneOff className="w-5 h-5" />
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
