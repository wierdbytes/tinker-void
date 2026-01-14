"""Transcription service using faster-whisper with sentence splitting."""

import logging
import os
from typing import Optional, List

from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)


class TranscriberService:
    """faster-whisper transcription with automatic sentence splitting."""

    def __init__(self):
        self.model: Optional[WhisperModel] = None
        self.model_loaded = False

        # Initial prompt with common IT terms
        self.initial_prompt = (
            "Это разговор о программировании и IT. "
            "Часто используются термины: API, backend, frontend, deploy, "
            "commit, pull request, merge, branch, Docker, Kubernetes, "
            "microservices, database, PostgreSQL, Redis, TypeScript, "
            "React, Next.js, component, props, state, hook, async, await, "
            "refactoring, code review, sprint, agile, scrum, endpoint."
        )

    def load_model(self, model_size: str = "large-v3-turbo"):
        """Load Whisper model."""
        cpu_threads = int(os.getenv("CPU_THREADS", "4"))
        model_path = os.getenv("MODEL_PATH", "/app/models")

        logger.info(f"Loading Whisper model {model_size} with {cpu_threads} threads...")

        self.model = WhisperModel(
            model_size,
            device="cpu",
            compute_type="int8",
            cpu_threads=cpu_threads,
            download_root=model_path,
        )

        self.model_loaded = True
        logger.info(f"Model {model_size} loaded successfully")

    def transcribe(self, audio_path: str, language: str = "ru") -> dict:
        """Transcribe audio file and split into sentence-level segments."""
        if not self.model:
            raise RuntimeError("Model not loaded")

        logger.info(f"Transcribing {audio_path}")

        # Transcribe entire file at once (more efficient than segments)
        segments, info = self.model.transcribe(
            audio_path,
            language=language,
            task="transcribe",
            initial_prompt=self.initial_prompt,
            beam_size=3,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={
                "threshold": 0.4,
                "min_silence_duration_ms": 200,
                "min_speech_duration_ms": 100,
                "speech_pad_ms": 50,
            },
            condition_on_previous_text=True,
            no_speech_threshold=0.6,
        )

        # Process segments and split by sentences
        all_segments = []
        all_texts = []

        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue

            # Split long segments by sentences using word timestamps
            if seg.words and len(text) > 60:
                sentence_segments = self._split_by_sentences(seg.words)
                all_segments.extend(sentence_segments)
                all_texts.extend(s['text'] for s in sentence_segments)
            else:
                all_segments.append({
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": text,
                })
                all_texts.append(text)

        full_text = " ".join(all_texts)

        logger.info(
            f"Transcription complete: {len(all_segments)} segments, "
            f"{info.duration:.1f}s duration"
        )

        return {
            "text": full_text,
            "segments": all_segments,
            "duration": info.duration,
            "language": info.language,
            "language_probability": info.language_probability,
        }

    def _split_by_sentences(self, words) -> List[dict]:
        """Split word list into sentences based on punctuation."""
        result = []
        current_words = []
        current_start = None

        for word in words:
            if current_start is None:
                current_start = word.start

            current_words.append(word.word)

            # End sentence on punctuation
            word_text = word.word.strip()
            if word_text and word_text[-1] in '.!?':
                text = "".join(current_words).strip()
                if text:
                    result.append({
                        "start": round(current_start, 3),
                        "end": round(word.end, 3),
                        "text": text,
                    })
                current_words = []
                current_start = None

        # Flush remaining words
        if current_words:
            text = "".join(current_words).strip()
            if text and words:
                result.append({
                    "start": round(current_start, 3),
                    "end": round(words[-1].end, 3),
                    "text": text,
                })

        return result
