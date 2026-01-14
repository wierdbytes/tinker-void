"""Transcription service using Silero VAD + faster-whisper."""

import logging
import os
import tempfile
import subprocess
from typing import Optional, List

from faster_whisper import WhisperModel

from .vad import WebRTCVAD

logger = logging.getLogger(__name__)


class TranscriberService:
    """faster-whisper transcription service with Silero VAD pre-segmentation."""

    def __init__(self):
        self.model: Optional[WhisperModel] = None
        self.vad: Optional[WebRTCVAD] = None
        self.model_loaded = False

        # Initial prompt with common IT terms to guide recognition
        self.initial_prompt = (
            "Это разговор о программировании и IT. "
            "Часто используются термины: API, backend, frontend, deploy, "
            "commit, pull request, merge, branch, Docker, Kubernetes, "
            "microservices, database, PostgreSQL, Redis, TypeScript, "
            "React, Next.js, component, props, state, hook, async, await, "
            "refactoring, code review, sprint, agile, scrum, endpoint, "
            "middleware, authentication, authorization, token, JWT, OAuth, "
            "repository, CI/CD, pipeline, container, cluster, node, pod, "
            "service, deployment, namespace, config, environment, variable."
        )

    def load_model(self, model_size: str = "large-v3"):
        """Load Whisper model and Silero VAD."""
        cpu_threads = int(os.getenv("CPU_THREADS", "4"))
        model_path = os.getenv("MODEL_PATH", "/app/models")

        logger.info(f"Loading Whisper model {model_size}...")

        self.model = WhisperModel(
            model_size,
            device="cpu",
            compute_type="int8",
            cpu_threads=cpu_threads,
            download_root=model_path,
        )

        logger.info("Loading WebRTC VAD...")
        self.vad = WebRTCVAD(aggressiveness=2)  # 0-3, 2 is balanced

        self.model_loaded = True
        logger.info("All models loaded successfully")

    def transcribe(self, audio_path: str, language: str = "ru") -> dict:
        """Transcribe audio using Silero VAD for segmentation + Whisper for ASR.

        This two-stage approach provides more accurate segment boundaries
        than relying solely on Whisper's built-in VAD.
        """
        if not self.model or not self.vad:
            raise RuntimeError("Models not loaded")

        logger.info(f"Transcribing {audio_path}")

        # Stage 1: Get speech segments from WebRTC VAD
        vad_segments = self.vad.get_speech_timestamps(
            audio_path,
            frame_duration_ms=30,        # 30ms frames
            min_speech_duration_ms=200,  # Minimum speech duration
            min_silence_duration_ms=150, # Split on short pauses
            speech_pad_ms=50,            # Small padding
        )

        # Merge very close segments but keep them reasonably short
        vad_segments = self.vad.merge_short_segments(
            vad_segments,
            max_gap_seconds=0.3,     # Merge if gap < 300ms
            max_segment_seconds=15,  # But don't exceed 15s per segment
        )

        logger.info(f"VAD detected {len(vad_segments)} speech segments")

        if not vad_segments:
            # No speech detected
            return {
                "text": "",
                "segments": [],
                "duration": 0,
                "language": language,
                "language_probability": 0,
            }

        # Stage 2: Transcribe each segment with Whisper
        all_segments = []
        all_texts = []
        total_duration = 0

        for i, vad_seg in enumerate(vad_segments):
            seg_start = vad_seg['start']
            seg_end = vad_seg['end']
            seg_duration = seg_end - seg_start

            logger.debug(f"Transcribing segment {i+1}/{len(vad_segments)}: {seg_start:.2f}s - {seg_end:.2f}s")

            # Extract audio segment using ffmpeg
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                tmp_path = tmp.name

            try:
                # Extract segment with ffmpeg
                subprocess.run([
                    'ffmpeg', '-y', '-i', audio_path,
                    '-ss', str(seg_start),
                    '-t', str(seg_duration),
                    '-ar', '16000', '-ac', '1',
                    '-f', 'wav', tmp_path
                ], capture_output=True, check=True)

                # Transcribe segment (without VAD since we already segmented)
                segments, info = self.model.transcribe(
                    tmp_path,
                    language=language,
                    task="transcribe",
                    initial_prompt=self.initial_prompt,
                    beam_size=5,
                    word_timestamps=True,
                    vad_filter=False,  # VAD already done
                    condition_on_previous_text=False,  # Each segment is independent
                    no_speech_threshold=0.6,
                )

                # Process transcription results
                for seg in segments:
                    text = seg.text.strip()
                    if not text:
                        continue

                    # Adjust timestamps to original audio timeline
                    adjusted_start = seg_start + seg.start
                    adjusted_end = seg_start + seg.end

                    # Split by sentences if segment is long
                    if seg.words and len(text) > 80:
                        sentence_segments = self._split_by_sentences(
                            seg.words, seg_start
                        )
                        all_segments.extend(sentence_segments)
                        all_texts.extend(s['text'] for s in sentence_segments)
                    else:
                        all_segments.append({
                            "start": round(adjusted_start, 3),
                            "end": round(adjusted_end, 3),
                            "text": text,
                        })
                        all_texts.append(text)

                total_duration = max(total_duration, seg_end)

            finally:
                # Cleanup temp file
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        full_text = " ".join(all_texts)

        logger.info(
            f"Transcription complete: {len(all_segments)} segments, "
            f"{total_duration:.1f}s duration"
        )

        return {
            "text": full_text,
            "segments": all_segments,
            "duration": total_duration,
            "language": language,
            "language_probability": 1.0,
        }

    def _split_by_sentences(self, words, offset: float) -> List[dict]:
        """Split word list into sentences based on punctuation."""
        result = []
        current_words = []
        current_start = None

        for word in words:
            if current_start is None:
                current_start = word.start

            current_words.append(word.word)

            # Check if word ends a sentence
            word_text = word.word.strip()
            if word_text and word_text[-1] in '.!?':
                text = "".join(current_words).strip()
                if text:
                    result.append({
                        "start": round(offset + current_start, 3),
                        "end": round(offset + word.end, 3),
                        "text": text,
                    })
                current_words = []
                current_start = None

        # Flush remaining words
        if current_words:
            text = "".join(current_words).strip()
            if text and words:
                result.append({
                    "start": round(offset + current_start, 3),
                    "end": round(offset + words[-1].end, 3),
                    "text": text,
                })

        return result
