import logging
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.schemas import (
    BatchResponse,
    HealthResponse,
    JobStatus,
    SegmentResponse,
    TranscribeRequest,
    TranscribeResponse,
)
from app.services.audio import convert_to_wav
from app.services.queue import QueueService
from app.services.storage import StorageService
from app.services.transcriber import TranscriberService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global services
transcriber: TranscriberService = None
storage: StorageService = None
queue: QueueService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    global transcriber, storage, queue

    settings = get_settings()

    # Initialize transcriber
    logger.info("Initializing transcriber service...")
    transcriber = TranscriberService()
    transcriber.load_model(settings.model_size)
    logger.info("Transcriber model loaded!")

    # Initialize storage
    logger.info("Initializing storage service...")
    storage = StorageService(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket=settings.minio_bucket,
        secure=settings.minio_use_ssl,
    )

    # Initialize queue
    logger.info("Initializing queue service...")
    queue = QueueService(settings.redis_url)

    logger.info("All services initialized!")

    yield

    # Cleanup
    await queue.close()
    logger.info("Services shut down")


app = FastAPI(
    title="TinkerVoid Transcriber",
    description="Speech-to-text transcription service using faster-whisper",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        model_loaded=transcriber.model_loaded if transcriber else False,
    )


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(request: TranscribeRequest):
    """Transcribe a single audio file synchronously."""
    if not transcriber or not transcriber.model_loaded:
        raise HTTPException(status_code=503, detail="Transcriber not ready")

    settings = get_settings()

    # Create temp directory for this request
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Download audio file
        audio_file = temp_path / "audio.ogg"
        try:
            await storage.download_file(request.file_url, audio_file)
        except Exception as e:
            logger.error(f"Failed to download {request.file_url}: {e}")
            raise HTTPException(status_code=404, detail=f"Audio file not found: {e}")

        # Convert to WAV if needed
        wav_file = await convert_to_wav(audio_file)

        try:
            # Transcribe
            result = transcriber.transcribe(
                str(wav_file),
                language=settings.default_language,
            )

            # Build response
            segments = [
                SegmentResponse(start=s["start"], end=s["end"], text=s["text"])
                for s in result["segments"]
            ]

            return TranscribeResponse(
                recording_id=request.recording_id,
                text=result["text"],
                segments=segments,
                duration=result["duration"],
            )
        finally:
            # Cleanup converted file if different from input
            if wav_file != audio_file and wav_file.exists():
                wav_file.unlink()


@app.post("/transcribe/batch", response_model=BatchResponse)
async def transcribe_batch(
    requests: List[TranscribeRequest],
    background_tasks: BackgroundTasks,
):
    """Queue batch transcription job for async processing."""
    job_id = str(uuid.uuid4())
    count = len(requests)

    logger.info(f"Batch job {job_id} with {count} files")

    # Initialize job status
    await queue.set_job_status(job_id, "queued", current=0, total=count)

    # Start background processing
    background_tasks.add_task(process_batch, job_id, requests)

    return BatchResponse(job_id=job_id, status="queued", count=count)


async def process_batch(job_id: str, requests: List[TranscribeRequest]):
    """Background batch processing."""
    settings = get_settings()
    total = len(requests)

    for i, request in enumerate(requests):
        await queue.set_job_status(job_id, "processing", current=i + 1, total=total)

        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)
                audio_file = temp_path / "audio.ogg"

                await storage.download_file(request.file_url, audio_file)
                wav_file = await convert_to_wav(audio_file)

                try:
                    result = transcriber.transcribe(
                        str(wav_file),
                        language=settings.default_language,
                    )

                    await queue.set_transcription_result(
                        request.recording_id,
                        status="completed",
                        text=result["text"],
                        duration=result["duration"],
                    )

                    # Send callback if provided
                    if request.callback_url:
                        segments = [
                            {"start": s["start"], "end": s["end"], "text": s["text"]}
                            for s in result["segments"]
                        ]

                        async with httpx.AsyncClient(timeout=30.0) as client:
                            await client.post(
                                request.callback_url,
                                json={
                                    "recording_id": request.recording_id,
                                    "text": result["text"],
                                    "segments": segments,
                                    "duration": result["duration"],
                                },
                            )

                    logger.info(f"Completed {request.recording_id}")

                finally:
                    if wav_file != audio_file and wav_file.exists():
                        wav_file.unlink()

        except Exception as e:
            logger.error(f"Failed {request.recording_id}: {e}")
            await queue.set_transcription_result(
                request.recording_id,
                status="failed",
                error=str(e),
            )

    await queue.set_job_status(job_id, "completed", current=total, total=total)
    logger.info(f"Batch job {job_id} completed")


@app.get("/job/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Get batch job status."""
    status = await queue.get_job_status(job_id)

    if not status:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatus(**status)


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(app, host=settings.host, port=settings.port)
