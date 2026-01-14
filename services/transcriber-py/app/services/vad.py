"""Silero VAD service using ONNX runtime (no PyTorch/torchaudio needed)."""

import logging
import subprocess
import tempfile
import os
import urllib.request

import numpy as np
import soundfile as sf
import onnxruntime as ort
from typing import List

logger = logging.getLogger(__name__)

# Silero VAD ONNX model URL
SILERO_VAD_URL = "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx"


class SileroVAD:
    """Silero VAD using ONNX runtime for speech segmentation."""

    def __init__(self):
        self.session: ort.InferenceSession = None
        self.sample_rate = 16000  # Silero VAD requires 16kHz

    def load_model(self, model_path: str = "/app/models/silero_vad.onnx"):
        """Load Silero VAD ONNX model."""
        logger.info("Loading Silero VAD ONNX model...")

        # Download if not exists
        if not os.path.exists(model_path):
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            logger.info(f"Downloading Silero VAD model to {model_path}...")
            urllib.request.urlretrieve(SILERO_VAD_URL, model_path)

        # Load ONNX model
        self.session = ort.InferenceSession(
            model_path,
            providers=['CPUExecutionProvider']
        )

        logger.info("Silero VAD model loaded")

    def get_speech_timestamps(
        self,
        audio_path: str,
        threshold: float = 0.5,
        min_speech_duration_ms: int = 250,
        min_silence_duration_ms: int = 100,
        speech_pad_ms: int = 30,
        window_size_samples: int = 512,
    ) -> List[dict]:
        """Detect speech segments in audio file.

        Args:
            audio_path: Path to audio file
            threshold: Speech probability threshold (0-1)
            min_speech_duration_ms: Minimum speech segment duration
            min_silence_duration_ms: Minimum silence to split segments
            speech_pad_ms: Padding around speech segments
            window_size_samples: Processing window size (512 for 16kHz)

        Returns:
            List of segments with 'start' and 'end' in seconds
        """
        if self.session is None:
            self.load_model()

        # Convert to 16kHz mono WAV
        wav_path = self._ensure_wav_16k(audio_path)

        try:
            # Load audio
            audio, sr = sf.read(wav_path, dtype='float32')
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)

            # Process with sliding window
            speech_probs = []
            state = np.zeros((2, 1, 128), dtype=np.float32)
            sr_tensor = np.array([self.sample_rate], dtype=np.int64)

            for i in range(0, len(audio), window_size_samples):
                chunk = audio[i:i + window_size_samples]
                if len(chunk) < window_size_samples:
                    chunk = np.pad(chunk, (0, window_size_samples - len(chunk)))

                chunk = chunk.reshape(1, -1).astype(np.float32)

                # Run inference
                ort_inputs = {
                    'input': chunk,
                    'state': state,
                    'sr': sr_tensor
                }
                out, state = self.session.run(None, ort_inputs)
                speech_probs.append(out[0][0])

            # Convert probabilities to timestamps
            segments = self._probs_to_segments(
                speech_probs,
                threshold=threshold,
                min_speech_duration_ms=min_speech_duration_ms,
                min_silence_duration_ms=min_silence_duration_ms,
                speech_pad_ms=speech_pad_ms,
                window_size_samples=window_size_samples,
            )

            logger.info(f"VAD detected {len(segments)} speech segments")
            return segments

        finally:
            if wav_path != audio_path and os.path.exists(wav_path):
                os.unlink(wav_path)

    def _probs_to_segments(
        self,
        speech_probs: List[float],
        threshold: float,
        min_speech_duration_ms: int,
        min_silence_duration_ms: int,
        speech_pad_ms: int,
        window_size_samples: int,
    ) -> List[dict]:
        """Convert speech probabilities to timestamp segments."""
        # Convert ms to samples
        min_speech_samples = int(min_speech_duration_ms * self.sample_rate / 1000)
        min_silence_samples = int(min_silence_duration_ms * self.sample_rate / 1000)
        speech_pad_samples = int(speech_pad_ms * self.sample_rate / 1000)

        # Find speech regions
        triggered = False
        speeches = []
        current_speech = {'start': 0, 'end': 0}
        temp_end = 0

        for i, prob in enumerate(speech_probs):
            sample_pos = i * window_size_samples

            if prob >= threshold:
                if not triggered:
                    triggered = True
                    current_speech['start'] = sample_pos
                temp_end = sample_pos + window_size_samples
            else:
                if triggered:
                    if sample_pos - temp_end >= min_silence_samples:
                        # End of speech
                        current_speech['end'] = temp_end
                        if current_speech['end'] - current_speech['start'] >= min_speech_samples:
                            speeches.append(current_speech.copy())
                        triggered = False
                        current_speech = {'start': 0, 'end': 0}

        # Handle last speech segment
        if triggered and temp_end - current_speech['start'] >= min_speech_samples:
            current_speech['end'] = temp_end
            speeches.append(current_speech)

        # Add padding and convert to seconds
        segments = []
        for s in speeches:
            start = max(0, s['start'] - speech_pad_samples)
            end = s['end'] + speech_pad_samples
            segments.append({
                'start': round(start / self.sample_rate, 3),
                'end': round(end / self.sample_rate, 3),
            })

        return segments

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
