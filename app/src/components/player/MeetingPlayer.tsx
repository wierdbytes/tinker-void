'use client'

import { AudioPlayerReturn } from '@/hooks/useAudioPlayer'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Play, Pause, Volume2, Volume1, VolumeX, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ParticipantStyle {
  bg: string
  text: string
  badge: string
}

interface Utterance {
  id: string
  startTime: number
  endTime: number
  participant: {
    id: string
  }
}

interface MeetingPlayerProps {
  player: AudioPlayerReturn
  participantStyles: Record<string, ParticipantStyle>
  utterances: Utterance[]
}

export function MeetingPlayer({
  player,
  participantStyles,
  utterances,
}: MeetingPlayerProps) {
  const {
    isPlaying,
    isLoading,
    currentTime,
    totalDuration,
    tracks,
    play,
    pause,
    seek,
    toggleMute,
    setVolume,
  } = player

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    seek(percentage * totalDuration)
  }

  if (tracks.length === 0 && !isLoading) {
    return null
  }

  const loadedTracks = tracks.filter(t => t.loaded).length
  const totalTracks = tracks.length

  return (
    <Card className="border-border/50 shadow-soft overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Main Controls */}
        <div className="flex items-center gap-4">
          {/* Play/Pause Button */}
          <Button
            variant="secondary"
            size="icon"
            onClick={isPlaying ? pause : play}
            disabled={isLoading || loadedTracks === 0}
            className="w-12 h-12 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </Button>

          {/* Progress Bar */}
          <div className="flex-1 space-y-1">
            <div
              className="relative h-2 bg-surface-secondary rounded-full cursor-pointer overflow-hidden"
              onClick={handleProgressClick}
            >
              {/* Utterance segments - colored by speaker */}
              {utterances.map(utterance => {
                if (totalDuration === 0) return null
                const startPercent = (utterance.startTime / totalDuration) * 100
                const widthPercent = ((utterance.endTime - utterance.startTime) / totalDuration) * 100
                return (
                  <div
                    key={utterance.id}
                    className={cn(
                      'absolute h-full rounded-sm',
                      participantStyles[utterance.participant.id]?.badge || 'bg-primary'
                    )}
                    style={{
                      left: `${startPercent}%`,
                      width: `${Math.max(widthPercent, 0.5)}%`,
                    }}
                  />
                )
              })}

              {/* Progress overlay - darkens played portion */}
              <div
                className="absolute h-full bg-background/50 rounded-full pointer-events-none"
                style={{
                  left: totalDuration > 0 ? `${(currentTime / totalDuration) * 100}%` : '0%',
                  right: 0,
                }}
              />

              {/* Seek handle */}
              {totalDuration > 0 && (
                <div
                  className="absolute w-3 h-3 bg-primary rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2 shadow-md"
                  style={{ left: `${(currentTime / totalDuration) * 100}%` }}
                />
              )}
            </div>

            {/* Time display */}
            <div className="flex justify-between text-xs text-muted-foreground font-mono">
              <span>{formatTime(currentTime)}</span>
              <span>
                {isLoading ? (
                  `${loadedTracks}/${totalTracks}`
                ) : (
                  formatTime(totalDuration)
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Speaker controls with volume */}
        <div className="flex flex-wrap gap-2">
          {tracks.map(track => {
            const style = participantStyles[track.participant.id]
            const VolumeIcon = track.muted || track.volume === 0
              ? VolumeX
              : track.volume < 0.5
              ? Volume1
              : Volume2

            return (
              <Popover key={track.id}>
                <PopoverTrigger asChild>
                  <button
                    disabled={!track.loaded}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all',
                      track.error
                        ? 'bg-destructive/10 text-destructive'
                        : track.muted
                        ? 'bg-surface-secondary text-muted-foreground'
                        : style?.bg || 'bg-primary/10',
                      !track.loaded && !track.error && 'opacity-50'
                    )}
                  >
                    <VolumeIcon className="w-4 h-4" />
                    <span className={cn(
                      'text-sm font-medium',
                      track.muted || track.error ? '' : style?.text
                    )}>
                      {track.participant.name}
                    </span>
                    {!track.loaded && !track.error && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-3" align="start">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{track.participant.name}</span>
                      <button
                        onClick={() => toggleMute(track.id)}
                        className="p-1 rounded hover:bg-surface-secondary transition-colors"
                      >
                        <VolumeIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <Slider
                      value={[track.muted ? 0 : track.volume * 100]}
                      onValueChange={([value]) => {
                        if (track.muted && value > 0) {
                          toggleMute(track.id)
                        }
                        setVolume(track.id, value / 100)
                      }}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <div className="text-xs text-muted-foreground text-center">
                      {track.muted ? 'Выкл' : `${Math.round(track.volume * 100)}%`}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
