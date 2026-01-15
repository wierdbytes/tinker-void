"""RabbitMQ consumer for transcription tasks."""

import asyncio
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx

from app.config import get_settings
from app.services.audio import convert_to_wav
from app.services.rabbitmq import (
    MAX_RETRIES,
    RabbitMQService,
    get_rabbitmq_service,
)
from app.services.storage import StorageService
from app.services.transcriber import TranscriberService

logger = logging.getLogger(__name__)

# Errors that should not be retried
PERMANENT_ERRORS = (
    "Audio file not found",
    "Invalid audio format",
    "Corrupted file",
    "404",
)


class TranscriptionConsumer:
    """Consumer for processing transcription tasks from RabbitMQ."""

    def __init__(
        self,
        transcriber: TranscriberService,
        storage: StorageService,
        rabbitmq: RabbitMQService,
    ):
        self.transcriber = transcriber
        self.storage = storage
        self.rabbitmq = rabbitmq
        self.settings = get_settings()
        self._running = False

    async def start(self) -> None:
        """Start consuming tasks."""
        self._running = True
        await self.rabbitmq.consume(self._process_task)

    async def stop(self) -> None:
        """Stop consuming tasks."""
        self._running = False

    async def _process_task(self, task: dict) -> None:
        """Process a single transcription task."""
        task_id = task.get("task_id", "unknown")
        recording_id = task.get("recording_id", "unknown")
        file_url = task.get("file_url", "")
        callback_url = task.get("callback_url", "")
        retry_count = task.get("retry_count", 0)

        logger.info(
            f"[TASK_PROCESSING] task_id={task_id} "
            f"recording_id={recording_id} file={file_url}"
        )

        start_time = datetime.now()

        try:
            result = await self._transcribe_file(file_url)

            processing_time_ms = int(
                (datetime.now() - start_time).total_seconds() * 1000
            )

            # Build response
            response = {
                "task_id": task_id,
                "recording_id": recording_id,
                "meeting_id": task.get("meeting_id"),
                "participant_id": task.get("participant_id"),
                "status": "completed",
                "text": result["text"],
                "segments": [
                    {"start": s["start"], "end": s["end"], "text": s["text"]}
                    for s in result["segments"]
                ],
                "duration": result["duration"],
                "processed_at": datetime.now().isoformat(),
                "processing_time_ms": processing_time_ms,
                "error": None,
            }

            # Send callback
            if callback_url:
                await self._send_callback(callback_url, response)

            logger.info(
                f"[TASK_COMPLETED] task_id={task_id} "
                f"duration={result['duration']:.1f}s "
                f"processing_time={processing_time_ms}ms"
            )

        except Exception as e:
            error_str = str(e)
            logger.error(f"[TASK_ERROR] task_id={task_id} error={error_str}")

            # Check if error is permanent (no retry)
            is_permanent = any(err in error_str for err in PERMANENT_ERRORS)

            if is_permanent or retry_count >= MAX_RETRIES:
                # Send to DLQ
                await self.rabbitmq.publish_to_dlq(task, error_str)

                # Send failure callback
                if callback_url:
                    await self._send_callback(
                        callback_url,
                        {
                            "task_id": task_id,
                            "recording_id": recording_id,
                            "meeting_id": task.get("meeting_id"),
                            "status": "failed",
                            "error": error_str,
                        },
                    )
            else:
                # Retry
                task["retry_count"] = retry_count + 1
                await self.rabbitmq.publish_to_retry(task)
                logger.info(
                    f"[TASK_RETRY] task_id={task_id} "
                    f"retry={retry_count + 1}/{MAX_RETRIES}"
                )

    async def _transcribe_file(self, file_url: str) -> dict:
        """Download and transcribe a file.

        Uses async transcription to avoid blocking the event loop,
        which is critical for maintaining RabbitMQ heartbeats and HTTP health checks.
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            audio_file = temp_path / "audio.ogg"

            # Download (async)
            await self.storage.download_file(file_url, audio_file)

            # Convert to WAV (async - uses asyncio subprocess)
            wav_file = await convert_to_wav(audio_file)

            try:
                # Transcribe (async - runs in thread pool executor)
                # This is the key fix: CPU-bound work doesn't block event loop
                result = await self.transcriber.transcribe_async(
                    str(wav_file),
                    language=self.settings.default_language,
                )
                return result
            finally:
                if wav_file != audio_file and wav_file.exists():
                    wav_file.unlink()

    async def _send_callback(self, url: str, data: dict) -> None:
        """Send HTTP callback with result."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=data)
                response.raise_for_status()
                logger.info(f"Callback sent to {url}: {response.status_code}")
        except Exception as e:
            logger.error(f"Failed to send callback to {url}: {e}")


# Global consumer instance
_consumer: Optional[TranscriptionConsumer] = None


async def start_consumer(
    transcriber: TranscriberService,
    storage: StorageService,
) -> TranscriptionConsumer:
    """Start the transcription consumer."""
    global _consumer

    settings = get_settings()

    # Connect with configured heartbeat to handle long transcriptions
    rabbitmq = await get_rabbitmq_service(
        settings.rabbitmq_url,
        heartbeat=settings.rabbitmq_heartbeat,
    )

    _consumer = TranscriptionConsumer(transcriber, storage, rabbitmq)

    # Start consuming in background
    asyncio.create_task(_consumer.start())

    logger.info("Transcription consumer started")
    return _consumer


async def stop_consumer() -> None:
    """Stop the transcription consumer."""
    global _consumer
    if _consumer:
        await _consumer.stop()
        _consumer = None
        logger.info("Transcription consumer stopped")
