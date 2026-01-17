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
import { DeviceSelect } from '@/components/audio/DeviceSelect'
import { AudioLevelMeter } from '@/components/audio/AudioLevelMeter'
import { useAudioDevices } from '@/components/audio/useAudioDevices'
import { useVideoDevices } from '@/components/video/useVideoDevices'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, Copy, Check, Waves, Monitor, MonitorOff, History, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoRoomProps {
  token: string
  serverUrl: string
  roomId: string
  roomName?: string
  participantName: string
  onLeave: () => void
  secretId?: string
  audioInputDeviceId?: string
  audioOutputDeviceId?: string
  videoInputDeviceId?: string
  micEnabled?: boolean
  cameraEnabled?: boolean
}

export function VideoRoom({
  token,
  serverUrl,
  roomId,
  roomName,
  participantName,
  onLeave,
  secretId,
  audioInputDeviceId,
  audioOutputDeviceId,
  videoInputDeviceId,
  micEnabled = true,
  cameraEnabled = false,
}: VideoRoomProps) {
  const roomOptions: RoomOptions = {
    audioCaptureDefaults: {
      deviceId: audioInputDeviceId || undefined,
    },
    videoCaptureDefaults: {
      deviceId: videoInputDeviceId || undefined,
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
      audio={micEnabled}
      video={cameraEnabled}
      onDisconnected={onLeave}
      options={roomOptions}
      className="h-full"
    >
      <RoomContent
        roomId={roomId}
        roomName={roomName}
        participantName={participantName}
        onLeave={onLeave}
        secretId={secretId}
        initialMicEnabled={micEnabled}
        initialCameraEnabled={cameraEnabled}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

interface RoomContentProps {
  roomId: string
  roomName?: string
  participantName: string
  onLeave: () => void
  secretId?: string
  initialMicEnabled?: boolean
  initialCameraEnabled?: boolean
}

function RoomContent({
  roomId,
  roomName,
  participantName,
  onLeave,
  secretId,
  initialMicEnabled = true,
  initialCameraEnabled = false,
}: RoomContentProps) {
  const room = useRoomContext()
  const { localParticipant, isScreenShareEnabled, isCameraEnabled } = useLocalParticipant()
  const participants = useParticipants()
  const [isMuted, setIsMuted] = useState(!initialMicEnabled)
  const [isCameraOff, setIsCameraOff] = useState(!initialCameraEnabled)
  const [copied, setCopied] = useState(false)

  // Audio devices hook
  const {
    audioInputDevices,
    audioOutputDevices,
    selectedInputId: selectedAudioInputId,
    selectedOutputId: selectedAudioOutputId,
    previewStream: audioPreviewStream,
    supportsAudioOutput,
    setInputDevice: setAudioInputDevice,
    setOutputDevice: setAudioOutputDevice,
  } = useAudioDevices(room)

  // Video devices hook
  const {
    videoInputDevices,
    selectedVideoId,
    setVideoDevice,
    requestPermission: requestVideoPermission,
  } = useVideoDevices(room)

  // Filter out devices with empty deviceId (happens before permission is granted)
  const validAudioInputDevices = audioInputDevices.filter(d => d.deviceId && d.deviceId !== '')
  const validVideoInputDevices = videoInputDevices.filter(d => d.deviceId && d.deviceId !== '')

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

  const toggleCamera = useCallback(async () => {
    if (localParticipant) {
      await localParticipant.setCameraEnabled(isCameraOff)
      setIsCameraOff(!isCameraOff)
    }
  }, [localParticipant, isCameraOff])

  const copyRoomLink = useCallback(() => {
    const url = secretId
      ? `${window.location.origin}/s/${secretId}`
      : `${window.location.origin}/room/${roomId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [secretId, roomId])

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
      <header className="px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        {/* Row 1: Icon, Room Name, Link Button, Right Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Waves className="w-4 h-4 text-primary" />
            </div>
            <h1 className="font-semibold text-foreground">
              {roomName || 'Встреча'}
            </h1>

            {/* Invite prompt when alone (desktop) */}
            {participants.length === 1 ? (
              <button
                onClick={copyRoomLink}
                className="hidden sm:inline-flex items-center gap-2 h-8 px-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 transition-colors"
              >
                <span>Вы единственный участник</span>
                <span className="text-amber-500/50">·</span>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Скопировано!' : 'Поделиться'}</span>
              </button>
            ) : null}

            {/* Regular link button */}
            <Button
              variant="outline"
              size="sm"
              onClick={copyRoomLink}
              className={cn(
                'h-8 text-xs border-border/50 hover:bg-muted hover:text-foreground',
                participants.length === 1 && 'sm:hidden'
              )}
            >
              {copied ? <Check className="w-3 h-3 mr-1.5" /> : <Copy className="w-3 h-3 mr-1.5" />}
              {copied ? 'Скопировано' : 'Ссылка'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {secretId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/s/${secretId}/history`, '_blank')}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                <History className="w-3 h-3 mr-1.5" />
                <span className="hidden sm:inline">История</span>
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* Row 2: Status indicators */}
        <div className="flex items-center gap-2 mt-2 ml-12">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            В эфире
          </span>
          <span className="text-border">·</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" />
            {participants.length}
          </span>
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
          /* Normal Grid Layout - fills available space */
          <div className="h-full p-4 flex items-center justify-center overflow-hidden">
            <div
              className="grid gap-3 w-full h-full"
              style={getGridStyle(participants.length)}
            >
              {participants.map((participant) => (
                <ParticipantTile
                  key={participant.identity}
                  participant={participant}
                  isLocal={participant.identity === localParticipant?.identity}
                  totalParticipants={participants.length}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-6 py-5 border-t border-border/50 bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-center gap-4">
          {/* Mute Button with Settings */}
          <div className="relative">
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

            {/* Audio Settings Dropdown */}
            {validAudioInputDevices.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-border/50 flex items-center justify-center hover:bg-muted transition-colors shadow-sm"
                    aria-label="Настройки аудио"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 bg-card border-border/50 shadow-soft-lg p-4"
                  align="center"
                  side="top"
                  sideOffset={8}
                >
                  <div className="space-y-4">
                    <DeviceSelect
                      label="Микрофон"
                      devices={audioInputDevices}
                      selectedDeviceId={selectedAudioInputId}
                      onDeviceChange={setAudioInputDevice}
                      kind="audioinput"
                    />

                    {audioPreviewStream && (
                      <div className="space-y-2">
                        <span className="text-xs text-muted-foreground">Уровень сигнала</span>
                        <AudioLevelMeter stream={audioPreviewStream} />
                      </div>
                    )}

                    {supportsAudioOutput && audioOutputDevices.length > 0 && (
                      <DeviceSelect
                        label="Динамики"
                        devices={audioOutputDevices}
                        selectedDeviceId={selectedAudioOutputId}
                        onDeviceChange={setAudioOutputDevice}
                        kind="audiooutput"
                      />
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Camera Button with Settings */}
          <div className="relative">
            <Button
              variant={isCameraOff ? 'destructive' : 'ghost'}
              size="icon"
              onClick={toggleCamera}
              className={cn(
                'w-14 h-14 rounded-full transition-all duration-200 hover:scale-105 active:scale-95',
                isCameraOff
                  ? 'bg-destructive hover:bg-destructive/90'
                  : 'bg-zinc-700 hover:bg-zinc-600'
              )}
              title={isCameraOff ? 'Включить камеру' : 'Выключить камеру'}
            >
              {isCameraOff ? (
                <VideoOff className="w-6 h-6 text-white" />
              ) : (
                <Video className="w-6 h-6 text-white" />
              )}
            </Button>

            {/* Camera Settings Dropdown */}
            <Popover
              onOpenChange={(open) => {
                // Request permission when opening dropdown if no devices yet
                if (open && validVideoInputDevices.length === 0) {
                  requestVideoPermission()
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-border/50 flex items-center justify-center hover:bg-muted transition-colors shadow-sm"
                  aria-label="Настройки камеры"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-72 bg-card border-border/50 shadow-soft-lg p-4"
                align="center"
                side="top"
                sideOffset={8}
              >
                {validVideoInputDevices.length > 0 ? (
                  <DeviceSelect
                    label="Камера"
                    devices={videoInputDevices}
                    selectedDeviceId={selectedVideoId}
                    onDeviceChange={setVideoDevice}
                    kind="videoinput"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Загрузка устройств...
                  </p>
                )}
              </PopoverContent>
            </Popover>
          </div>

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
  totalParticipants?: number
}

/**
 * Calculate optimal grid layout based on participant count.
 * Returns CSS grid styles for responsive tile arrangement.
 */
function getGridStyle(count: number): React.CSSProperties {
  // Grid configuration: [columns, rows]
  const layouts: Record<number, [number, number]> = {
    1: [1, 1],
    2: [2, 1],
    3: [3, 1],
    4: [2, 2],
    5: [3, 2],
    6: [3, 2],
    7: [4, 2],
    8: [4, 2],
    9: [3, 3],
    10: [4, 3],
    11: [4, 3],
    12: [4, 3],
  }

  const [cols, rows] = layouts[count] || [
    Math.ceil(Math.sqrt(count)),
    Math.ceil(count / Math.ceil(Math.sqrt(count))),
  ]

  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    placeItems: 'center',
  }
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

function ParticipantTile({ participant, isLocal, totalParticipants = 1 }: ParticipantTileProps) {
  const tracks = useTracks([Track.Source.Microphone, Track.Source.Camera], { onlySubscribed: false })
  const cameraTrack = tracks.find(
    (t) => t.participant.identity === participant.identity && t.source === Track.Source.Camera
  )

  const isSpeaking = participant.isSpeaking
  const isMuted = !participant.isMicrophoneEnabled
  const hasVideo = cameraTrack && !cameraTrack.publication?.isMuted
  const avatarColor = getAvatarColor(participant.name || participant.identity)

  // Adaptive sizing based on participant count
  const isSmallGrid = totalParticipants <= 2
  const isMediumGrid = totalParticipants <= 4
  const avatarSize = isSmallGrid ? 'w-24 h-24 text-3xl' : isMediumGrid ? 'w-20 h-20 text-2xl' : 'w-16 h-16 text-xl'
  const nameSize = isSmallGrid ? 'text-lg' : isMediumGrid ? 'text-base' : 'text-sm'
  const padding = isSmallGrid ? 'p-4' : isMediumGrid ? 'p-3' : 'p-2'

  return (
    <div className="w-full h-full flex items-center justify-center" style={{ containerType: 'size' }}>
      <div
        className={cn(
          'participant-tile relative rounded-2xl bg-card border-2 transition-all duration-300 overflow-hidden',
          isSpeaking
            ? 'border-primary shadow-soft-lg pulse-glow'
            : 'border-border/30 shadow-soft',
          isLocal && 'border-primary/50'
        )}
      >
        {hasVideo ? (
          /* Video Mode */
          <>
            <VideoTrack
              trackRef={cameraTrack}
              className={cn(
                'w-full h-full object-cover',
                isLocal && 'scale-x-[-1]'
              )}
            />
            {/* Name overlay */}
            <div className={cn('absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent', padding)}>
              <p className={cn('text-white font-medium truncate', nameSize)}>
                {participant.name || participant.identity}
                {isLocal && <span className="text-white/70 ml-1">(вы)</span>}
              </p>
            </div>
            {/* Mute indicator */}
            {isMuted && (
              <div className={cn('absolute top-3 right-3 bg-destructive rounded-lg shadow-soft', isSmallGrid ? 'p-2' : 'p-1.5')}>
                <MicOff className={cn(isSmallGrid ? 'w-4 h-4' : 'w-3 h-3', 'text-destructive-foreground')} />
              </div>
            )}
            {/* Speaking indicator */}
            {isSpeaking && (
              <div className={cn('absolute top-3 left-3 flex items-end gap-0.5', isSmallGrid ? 'h-5' : 'h-4')}>
                <span className="w-1 bg-primary rounded-full sound-wave" style={{ height: '40%' }} />
                <span className="w-1 bg-primary rounded-full sound-wave sound-wave-delay-1" style={{ height: '80%' }} />
                <span className="w-1 bg-primary rounded-full sound-wave sound-wave-delay-2" style={{ height: '100%' }} />
                <span className="w-1 bg-primary rounded-full sound-wave sound-wave-delay-3" style={{ height: '60%' }} />
              </div>
            )}
          </>
        ) : (
          /* Avatar Mode - centered content within container */
          <div className={cn('absolute inset-0 flex flex-col items-center justify-center', padding)}>
            {/* Avatar */}
            <div
              className={cn(
                'rounded-2xl flex items-center justify-center font-bold text-white mb-3 shadow-soft bg-gradient-to-br transition-transform duration-300',
                avatarSize,
                avatarColor,
                isSpeaking && 'scale-105'
              )}
            >
              {participant.name?.charAt(0)?.toUpperCase() || '?'}
            </div>

            {/* Name */}
            <p className={cn('text-foreground font-medium text-center truncate max-w-full mb-2', nameSize)}>
              {participant.name || participant.identity}
              {isLocal && <span className="text-muted-foreground ml-1">(вы)</span>}
            </p>

            {/* Speaking indicator */}
            <div className={cn('flex items-end justify-center gap-0.5 w-full', isSmallGrid ? 'h-5' : 'h-4')}>
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
              <div className={cn('absolute top-3 right-3 bg-destructive rounded-lg shadow-soft', isSmallGrid ? 'p-2' : 'p-1.5')}>
                <MicOff className={cn(isSmallGrid ? 'w-4 h-4' : 'w-3 h-3', 'text-destructive-foreground')} />
              </div>
            )}

            {/* Camera off indicator */}
            <div className={cn('absolute bottom-3 right-3 bg-muted rounded-md', isSmallGrid ? 'p-1.5' : 'p-1')}>
              <VideoOff className={cn(isSmallGrid ? 'w-4 h-4' : 'w-3 h-3', 'text-muted-foreground')} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ParticipantTileCompact({ participant, isLocal }: ParticipantTileProps) {
  const tracks = useTracks([Track.Source.Microphone, Track.Source.Camera], { onlySubscribed: false })
  const cameraTrack = tracks.find(
    (t) => t.participant.identity === participant.identity && t.source === Track.Source.Camera
  )

  const isSpeaking = participant.isSpeaking
  const isMuted = !participant.isMicrophoneEnabled
  const hasVideo = cameraTrack && !cameraTrack.publication?.isMuted
  const avatarColor = getAvatarColor(participant.name || participant.identity)

  return (
    <div
      className={cn(
        'relative rounded-xl bg-card border-2 transition-all duration-300 overflow-hidden',
        isSpeaking
          ? 'border-primary shadow-soft pulse-glow'
          : 'border-border/30 shadow-soft',
        isLocal && 'border-primary/50'
      )}
      style={{ aspectRatio: '16/9' }}
    >
      {hasVideo ? (
        /* Video mode */
        <>
          <VideoTrack
            trackRef={cameraTrack}
            className={cn(
              'w-full h-full object-cover',
              isLocal && 'scale-x-[-1]'
            )}
          />
          {/* Name overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
            <p className="text-white text-xs font-medium truncate">
              {participant.name || participant.identity}
              {isLocal && <span className="text-white/70 ml-1">(вы)</span>}
            </p>
          </div>
        </>
      ) : (
        /* Avatar mode */
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
          <div
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white bg-gradient-to-br transition-transform duration-300 mb-2',
              avatarColor,
              isSpeaking && 'scale-105'
            )}
          >
            {participant.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <p className="text-foreground text-xs font-medium truncate max-w-full text-center">
            {participant.name || participant.identity}
            {isLocal && <span className="text-muted-foreground ml-1">(вы)</span>}
          </p>
        </div>
      )}

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="absolute top-2 left-2 flex items-end gap-0.5 h-3">
          <span className="w-0.5 bg-primary rounded-full sound-wave" style={{ height: '40%' }} />
          <span className="w-0.5 bg-primary rounded-full sound-wave sound-wave-delay-1" style={{ height: '80%' }} />
          <span className="w-0.5 bg-primary rounded-full sound-wave sound-wave-delay-2" style={{ height: '100%' }} />
          <span className="w-0.5 bg-primary rounded-full sound-wave sound-wave-delay-3" style={{ height: '60%' }} />
        </div>
      )}

      {/* Mute indicator */}
      {isMuted && (
        <div className="absolute top-2 right-2 p-1 bg-destructive rounded-md">
          <MicOff className="w-3 h-3 text-destructive-foreground" />
        </div>
      )}
    </div>
  )
}
