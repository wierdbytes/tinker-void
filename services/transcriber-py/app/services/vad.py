"""WebRTC VAD service for speech segmentation."""

import logging
import subprocess
import tempfile
import os
import struct

import webrtcvad
import soundfile as sf
import numpy as np
from typing import List

logger = logging.getLogger(__name__)


class WebRTCVAD:
    """WebRTC VAD for detecting speech segments in audio."""

    def __init__(self, aggressiveness: int = 2):
        """Initialize VAD.

        Args:
            aggressiveness: 0-3, higher = more aggressive filtering of non-speech
        """
        self.vad = webrtcvad.Vad(aggressiveness)
        self.sample_rate = 16000  # WebRTC VAD supports 8000, 16000, 32000, 48000

    def get_speech_timestamps(
        self,
        audio_path: str,
        frame_duration_ms: int = 30,
        min_speech_duration_ms: int = 250,
        min_silence_duration_ms: int = 100,
        speech_pad_ms: int = 50,
    ) -> List[dict]:
        """Detect speech segments in audio file.

        Args:
            audio_path: Path to audio file
            frame_duration_ms: Frame size (10, 20, or 30 ms)
            min_speech_duration_ms: Minimum speech segment duration
            min_silence_duration_ms: Minimum silence to split segments
            speech_pad_ms: Padding around speech segments

        Returns:
            List of segments with 'start' and 'end' in seconds
        """
        # Convert to 16kHz mono WAV
        wav_path = self._ensure_wav_16k(audio_path)

        try:
            # Load audio as 16-bit PCM
            audio, sr = sf.read(wav_path, dtype='int16')
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1).astype('int16')

            # Calculate frame size
            frame_size = int(self.sample_rate * frame_duration_ms / 1000)

            # Process frames
            speech_frames = []
            for i in range(0, len(audio) - frame_size, frame_size):
                frame = audio[i:i + frame_size]
                # Convert to bytes for webrtcvad
                frame_bytes = struct.pack(f'{len(frame)}h', *frame)
                is_speech = self.vad.is_speech(frame_bytes, self.sample_rate)
                speech_frames.append({
                    'start': i,
                    'end': i + frame_size,
                    'is_speech': is_speech
                })

            # Convert frames to segments
            segments = self._frames_to_segments(
                speech_frames,
                min_speech_duration_ms=min_speech_duration_ms,
                min_silence_duration_ms=min_silence_duration_ms,
                speech_pad_ms=speech_pad_ms,
            )

            logger.info(f"VAD detected {len(segments)} speech segments")
            return segments

        finally:
            if wav_path != audio_path and os.path.exists(wav_path):
                os.unlink(wav_path)

    def _frames_to_segments(
        self,
        frames: List[dict],
        min_speech_duration_ms: int,
        min_silence_duration_ms: int,
        speech_pad_ms: int,
    ) -> List[dict]:
        """Convert frame-level speech detection to segments."""
        min_speech_samples = int(min_speech_duration_ms * self.sample_rate / 1000)
        min_silence_samples = int(min_silence_duration_ms * self.sample_rate / 1000)
        speech_pad_samples = int(speech_pad_ms * self.sample_rate / 1000)

        segments = []
        current_speech = None
        silence_start = None

        for frame in frames:
            if frame['is_speech']:
                if current_speech is None:
                    current_speech = {'start': frame['start'], 'end': frame['end']}
                else:
                    current_speech['end'] = frame['end']
                silence_start = None
            else:
                if current_speech is not None:
                    if silence_start is None:
                        silence_start = frame['start']

                    silence_duration = frame['end'] - silence_start
                    if silence_duration >= min_silence_samples:
                        # End current speech segment
                        if current_speech['end'] - current_speech['start'] >= min_speech_samples:
                            segments.append(current_speech)
                        current_speech = None
                        silence_start = None

        # Handle last segment
        if current_speech is not None:
            if current_speech['end'] - current_speech['start'] >= min_speech_samples:
                segments.append(current_speech)

        # Add padding and convert to seconds
        result = []
        for seg in segments:
            start = max(0, seg['start'] - speech_pad_samples)
            end = seg['end'] + speech_pad_samples
            result.append({
                'start': round(start / self.sample_rate, 3),
                'end': round(end / self.sample_rate, 3),
            })

        return result

    def _ensure_wav_16k(self, audio_path: str) -> str:
        """Convert audio to 16kHz mono WAV if needed."""
        try:
            info = sf.info(audio_path)
            if info.samplerate == 16000 and info.channels == 1:
                return audio_path
        except Exception:
            pass

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            tmp_path = tmp.name

        subprocess.run([
            'ffmpeg', '-y', '-i', audio_path,
            '-ar', '16000', '-ac', '1',
            '-f', 'wav', tmp_path
        ], capture_output=True, check=True)

        return tmp_path

    def merge_short_segments(
        self,
        segments: List[dict],
        max_gap_seconds: float = 0.5,
        max_segment_seconds: float = 30.0,
    ) -> List[dict]:
        """Merge segments that are close together."""
        if not segments:
            return []

        merged = []
        current = segments[0].copy()

        for seg in segments[1:]:
            gap = seg['start'] - current['end']
            merged_duration = seg['end'] - current['start']

            if gap <= max_gap_seconds and merged_duration <= max_segment_seconds:
                current['end'] = seg['end']
            else:
                merged.append(current)
                current = seg.copy()

        merged.append(current)
        return merged
