import logging
import os
from typing import Optional

from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)


class TranscriberService:
    """faster-whisper transcription service optimized for Russian + English IT terms."""

    def __init__(self):
        self.model: Optional[WhisperModel] = None
        self.model_loaded = False

        # Initial prompt with common IT terms to guide recognition
        # This helps Whisper recognize English terms in Russian context
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
        """Load the Whisper model with CPU optimization."""
        cpu_threads = int(os.getenv("CPU_THREADS", "4"))
        model_path = os.getenv("MODEL_PATH", "/app/models")

        logger.info(f"Loading model {model_size} with {cpu_threads} CPU threads...")

        # For CPU-only inference:
        # - compute_type="int8" for faster inference on CPU
        # - device="cpu" explicitly
        # - cpu_threads controls parallelism
        self.model = WhisperModel(
            model_size,
            device="cpu",
            compute_type="int8",  # INT8 quantization for CPU
            cpu_threads=cpu_threads,  # Match to available cores
            download_root=model_path,  # Cache location in Docker
        )

        self.model_loaded = True
        logger.info(f"Model {model_size} loaded successfully")

    def transcribe(self, audio_path: str, language: str = "ru") -> dict:
        """Transcribe audio file with optimized settings for Russian + English.

        Args:
            audio_path: Path to WAV audio file
            language: Primary language (default: "ru" for Russian)

        Returns:
            dict with text, segments, duration, and language info
        """
        if not self.model:
            raise RuntimeError("Model not loaded")

        logger.info(f"Transcribing {audio_path}")

        segments, info = self.model.transcribe(
            audio_path,
            # Language settings for code-switching
            language=language,  # Primary language: Russian
            task="transcribe",  # Not translation
            # Initial prompt helps with IT terminology recognition
            initial_prompt=self.initial_prompt,
            # Quality settings (higher = better but slower)
            beam_size=5,  # Default is 5, good balance
            patience=1.0,  # Beam search patience (1.0 = standard)
            # Timestamps
            word_timestamps=True,  # Get word-level timing for segments
            # VAD (Voice Activity Detection) for better segments
            vad_filter=True,  # Filter out non-speech
            vad_parameters={
                "min_silence_duration_ms": 500,  # Minimum silence to split
                "speech_pad_ms": 200,  # Padding around speech
            },
            # Prevent hallucinations on silence
            no_speech_threshold=0.6,
            # Compression ratio threshold to detect repetition
            compression_ratio_threshold=2.4,
            # Log probability threshold
            log_prob_threshold=-1.0,
            # Condition on previous text for context continuity
            condition_on_previous_text=True,
        )

        # Convert generator to list and process
        segments_list = list(segments)

        # Build full text from segments
        full_text = " ".join(seg.text.strip() for seg in segments_list)

        # Process segments into response format
        processed_segments = []
        for seg in segments_list:
            processed_segments.append(
                {
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": seg.text.strip(),
                }
            )

        logger.info(
            f"Transcription complete: {len(processed_segments)} segments, "
            f"{info.duration:.1f}s duration, language={info.language}"
        )

        return {
            "text": full_text,
            "segments": processed_segments,
            "duration": info.duration,
            "language": info.language,
            "language_probability": info.language_probability,
        }
