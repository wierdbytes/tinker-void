"""Silero VAD service for accurate speech segmentation."""

import logging
import torch
import torchaudio
from typing import List, Tuple, Optional

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

        # Load audio
        wav, sr = torchaudio.load(audio_path)

        # Convert to mono if stereo
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0, keepdim=True)

        # Resample to 16kHz if needed
        if sr != self.sample_rate:
            resampler = torchaudio.transforms.Resample(sr, self.sample_rate)
            wav = resampler(wav)

        # Squeeze to 1D
        wav = wav.squeeze()

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
