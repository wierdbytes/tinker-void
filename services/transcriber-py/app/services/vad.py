"""Silero VAD service for accurate speech segmentation."""

import logging
import subprocess
import tempfile
import os

import torch
import soundfile as sf
import numpy as np
from typing import List, Optional

logger = logging.getLogger(__name__)


class SileroVAD:
    """Silero VAD for detecting speech segments in audio."""

    def __init__(self):
        self.model = None
        self.utils = None
        self.sample_rate = 16000  # Silero VAD requires 16kHz

    def load_model(self):
        """Load Silero VAD model from torch hub."""
        logger.info("Loading Silero VAD model...")

        self.model, self.utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False,
            onnx=False,
            trust_repo=True
        )

        logger.info("Silero VAD model loaded")

    def get_speech_timestamps(
        self,
        audio_path: str,
        threshold: float = 0.4,
        min_speech_duration_ms: int = 250,
        min_silence_duration_ms: int = 150,
        speech_pad_ms: int = 50,
    ) -> List[dict]:
        """Detect speech segments in audio file.

        Args:
            audio_path: Path to audio file (WAV recommended)
            threshold: Speech probability threshold (0-1, lower = more sensitive)
            min_speech_duration_ms: Minimum speech segment duration
            min_silence_duration_ms: Minimum silence to split segments
            speech_pad_ms: Padding around speech segments

        Returns:
            List of segments with 'start' and 'end' in seconds
        """
        if self.model is None:
            self.load_model()

        # Convert to 16kHz mono WAV using ffmpeg if needed
        wav_path = self._ensure_wav_16k(audio_path)

        try:
            # Load audio with soundfile
            data, sr = sf.read(wav_path)

            # Convert to mono if stereo
            if len(data.shape) > 1:
                data = data.mean(axis=1)

            # Convert to torch tensor
            wav = torch.from_numpy(data).float()

            # Get speech timestamps using Silero VAD
            get_speech_timestamps = self.utils[0]

            speech_timestamps = get_speech_timestamps(
                wav,
                self.model,
                threshold=threshold,
                sampling_rate=self.sample_rate,
                min_speech_duration_ms=min_speech_duration_ms,
                min_silence_duration_ms=min_silence_duration_ms,
                speech_pad_ms=speech_pad_ms,
            )

            # Convert sample indices to seconds
            segments = []
            for ts in speech_timestamps:
                segments.append({
                    'start': round(ts['start'] / self.sample_rate, 3),
                    'end': round(ts['end'] / self.sample_rate, 3),
                })

            logger.info(f"VAD detected {len(segments)} speech segments")
            return segments

        finally:
            # Cleanup temp file if we created one
            if wav_path != audio_path and os.path.exists(wav_path):
                os.unlink(wav_path)

    def _ensure_wav_16k(self, audio_path: str) -> str:
        """Convert audio to 16kHz mono WAV if needed."""
        # Check if already 16kHz WAV
        try:
            info = sf.info(audio_path)
            if info.samplerate == 16000 and info.channels == 1:
                return audio_path
        except Exception:
            pass  # Not a valid soundfile, need conversion

        # Convert with ffmpeg
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
        """Merge segments that are close together, but keep reasonable length.

        Args:
            segments: List of segments with 'start' and 'end'
            max_gap_seconds: Maximum gap to merge
            max_segment_seconds: Maximum merged segment duration

        Returns:
            Merged segments list
        """
        if not segments:
            return []

        merged = []
        current = segments[0].copy()

        for seg in segments[1:]:
            gap = seg['start'] - current['end']
            merged_duration = seg['end'] - current['start']

            # Merge if gap is small and result won't be too long
            if gap <= max_gap_seconds and merged_duration <= max_segment_seconds:
                current['end'] = seg['end']
            else:
                merged.append(current)
                current = seg.copy()

        merged.append(current)
        return merged
