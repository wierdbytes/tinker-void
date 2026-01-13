'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useTracks,
  useRoomContext,
} from '@livekit/components-react'
import { Track, RoomEvent, RoomOptions } from 'livekit-client'
import '@livekit/components-styles'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InCallAudioSettings } from '@/components/audio/InCallAudioSettings'
import { Mic, MicOff, PhoneOff, Users, Copy, Check, Settings } from 'lucide-react'
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
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-white">Комната: {roomId.slice(0, 8)}...</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={copyRoomLink}
            className="text-gray-300 border-gray-600 hover:bg-gray-700"
          >
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Скопировано!' : 'Копировать ссылку'}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <Users className="w-5 h-5" />
          <span>{participants.length} участник(ов)</span>
        </div>
      </div>

      {/* Participants Grid */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {participants.map((participant) => (
            <ParticipantTile
              key={participant.identity}
              participant={participant}
              isLocal={participant.identity === localParticipant?.identity}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-6 py-6 bg-gray-800 border-t border-gray-700">
        <Button
          variant={isMuted ? 'destructive' : 'secondary'}
          size="lg"
          onClick={toggleMute}
          className="rounded-full w-14 h-14"
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="secondary"
              size="lg"
              className="rounded-full w-14 h-14"
            >
              <Settings className="w-6 h-6" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 bg-gray-800 border-gray-600">
            <InCallAudioSettings />
          </PopoverContent>
        </Popover>

        <Button
          variant="destructive"
          size="lg"
          onClick={handleLeave}
          className="rounded-full w-14 h-14"
        >
          <PhoneOff className="w-6 h-6" />
        </Button>
      </div>
    </div>
  )
}

interface ParticipantTileProps {
  participant: any
  isLocal: boolean
}

function ParticipantTile({ participant, isLocal }: ParticipantTileProps) {
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: false })
  const audioTrack = tracks.find(
    (t) => t.participant.identity === participant.identity && t.source === Track.Source.Microphone
  )

  const isSpeaking = participant.isSpeaking
  const isMuted = !audioTrack?.publication?.isMuted === false

  return (
    <Card
      className={cn(
        'relative flex flex-col items-center justify-center p-6 bg-gray-800 border-2 transition-all',
        isSpeaking ? 'border-green-500 shadow-lg shadow-green-500/20' : 'border-gray-700',
        isLocal && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-3',
          isLocal ? 'bg-blue-600' : 'bg-purple-600'
        )}
      >
        {participant.name?.charAt(0)?.toUpperCase() || '?'}
      </div>

      {/* Name */}
      <p className="text-white font-medium text-center truncate max-w-full">
        {participant.name || participant.identity}
        {isLocal && <span className="text-gray-400 text-sm ml-1">(вы)</span>}
      </p>

      {/* Mute indicator */}
      {isMuted && (
        <div className="absolute top-2 right-2 p-1 bg-red-500 rounded-full">
          <MicOff className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse delay-75" />
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse delay-150" />
        </div>
      )}
    </Card>
  )
}
