import os
import tempfile
import asyncio
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from minio import Minio
import redis.asyncio as redis

# Transcriber will be loaded on startup
transcriber = None


class TranscribeRequest(BaseModel):
    file_url: str
    recording_id: str
    callback_url: Optional[str] = None


class TranscribeResponse(BaseModel):
    recording_id: str
    text: str
    segments: list[dict]
    duration: float


class TranscriptionResult(BaseModel):
    text: str
    segments: list[dict]  # [{start: float, end: float, text: str}]
    duration: float


@asynccontextmanager
async def lifespan(app: FastAPI):
    global transcriber
    print("Loading Parakeet model...")
    transcriber = ParakeetTranscriber()
    print("Model loaded successfully!")
    yield
    print("Shutting down...")


app = FastAPI(title="TinkerVoid Transcriber", lifespan=lifespan)

# MinIO client
minio_client = Minio(
    os.environ.get("MINIO_ENDPOINT", "minio:9000"),
    access_key=os.environ.get("MINIO_ACCESS_KEY", "minioadmin"),
    secret_key=os.environ.get("MINIO_SECRET_KEY", "minioadmin123"),
    secure=False,
)

# Redis client
redis_url = os.environ.get("REDIS_URL", "redis://redis:6379")


class ParakeetTranscriber:
    def __init__(self):
        import nemo.collections.asr as nemo_asr

        # Load Parakeet TDT 1.1B model - good balance of speed and accuracy
        # For better accuracy, use 'nvidia/parakeet-tdt-1.1b' or 'nvidia/parakeet-ctc-1.1b'
        self.model = nemo_asr.models.ASRModel.from_pretrained("nvidia/parakeet-tdt-1.1b")
        self.model.eval()

        # Enable GPU if available
        import torch
        if torch.cuda.is_available():
            self.model = self.model.cuda()
            print("Using GPU for transcription")
        else:
            print("Using CPU for transcription (slower)")

    def transcribe(self, audio_path: str) -> TranscriptionResult:
        """Transcribe audio file and return text with timestamps."""
        import torch

        # Transcribe with timestamps
        with torch.no_grad():
            # For Parakeet TDT, we can get word-level timestamps
            result = self.model.transcribe([audio_path], return_hypotheses=True)

        if not result or not result[0]:
            return TranscriptionResult(text="", segments=[], duration=0.0)

        hypothesis = result[0][0] if isinstance(result[0], list) else result[0]

        # Extract text
        text = hypothesis.text if hasattr(hypothesis, 'text') else str(hypothesis)

        # Try to extract word timestamps if available
        segments = []
        if hasattr(hypothesis, 'timestep') and hypothesis.timestep:
            # Convert timesteps to segments
            words = text.split()
            timesteps = hypothesis.timestep

            for i, (word, ts) in enumerate(zip(words, timesteps)):
                segments.append({
                    "start": float(ts.start_offset) if hasattr(ts, 'start_offset') else 0.0,
                    "end": float(ts.end_offset) if hasattr(ts, 'end_offset') else 0.0,
                    "text": word,
                })
        else:
            # No timestamps available, create single segment
            segments = [{"start": 0.0, "end": 0.0, "text": text}]

        # Get audio duration
        import torchaudio
        waveform, sample_rate = torchaudio.load(audio_path)
        duration = waveform.shape[1] / sample_rate

        return TranscriptionResult(
            text=text,
            segments=segments,
            duration=float(duration),
        )


def download_from_minio(file_url: str, local_path: str) -> bool:
    """Download file from MinIO to local path."""
    try:
        bucket = os.environ.get("MINIO_BUCKET", "recordings")

        # file_url might be full path or just object name
        object_name = file_url.replace(f"{bucket}/", "") if file_url.startswith(bucket) else file_url

        minio_client.fget_object(bucket, object_name, local_path)
        return True
    except Exception as e:
        print(f"Failed to download from MinIO: {e}")
        return False


@app.get("/health")
async def health():
    return {"status": "healthy", "model_loaded": transcriber is not None}


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(request: TranscribeRequest):
    """Transcribe an audio file from MinIO storage."""
    if transcriber is None:
        raise HTTPException(status_code=503, detail="Transcriber not ready")

    # Create temp file for downloaded audio
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp_file:
        tmp_path = tmp_file.name

    try:
        # Download from MinIO
        if not download_from_minio(request.file_url, tmp_path):
            raise HTTPException(status_code=404, detail="Audio file not found")

        # Transcribe
        result = transcriber.transcribe(tmp_path)

        return TranscribeResponse(
            recording_id=request.recording_id,
            text=result.text,
            segments=result.segments,
            duration=result.duration,
        )
    finally:
        # Cleanup
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/transcribe/batch")
async def transcribe_batch(requests: list[TranscribeRequest], background_tasks: BackgroundTasks):
    """Queue multiple files for transcription."""
    job_id = os.urandom(8).hex()

    # Queue for background processing
    background_tasks.add_task(process_batch, job_id, requests)

    return {"job_id": job_id, "status": "queued", "count": len(requests)}


async def process_batch(job_id: str, requests: list[TranscribeRequest]):
    """Process batch of transcription requests."""
    redis_client = redis.from_url(redis_url)

    try:
        for i, request in enumerate(requests):
            try:
                # Update progress
                await redis_client.hset(
                    f"transcribe:job:{job_id}",
                    mapping={
                        "status": "processing",
                        "current": str(i + 1),
                        "total": str(len(requests)),
                    }
                )

                # Create temp file
                with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp_file:
                    tmp_path = tmp_file.name

                try:
                    if download_from_minio(request.file_url, tmp_path):
                        result = transcriber.transcribe(tmp_path)

                        # Store result
                        await redis_client.hset(
                            f"transcribe:result:{request.recording_id}",
                            mapping={
                                "text": result.text,
                                "duration": str(result.duration),
                                "status": "completed",
                            }
                        )

                        # Send callback if provided
                        if request.callback_url:
                            import httpx
                            async with httpx.AsyncClient() as client:
                                await client.post(
                                    request.callback_url,
                                    json={
                                        "recording_id": request.recording_id,
                                        "text": result.text,
                                        "segments": result.segments,
                                        "duration": result.duration,
                                    }
                                )
                finally:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)

            except Exception as e:
                print(f"Failed to transcribe {request.recording_id}: {e}")
                await redis_client.hset(
                    f"transcribe:result:{request.recording_id}",
                    mapping={"status": "failed", "error": str(e)}
                )

        # Mark job as complete
        await redis_client.hset(f"transcribe:job:{job_id}", "status", "completed")

    finally:
        await redis_client.close()


@app.get("/job/{job_id}")
async def get_job_status(job_id: str):
    """Get status of a batch transcription job."""
    redis_client = redis.from_url(redis_url)
    try:
        status = await redis_client.hgetall(f"transcribe:job:{job_id}")
        if not status:
            raise HTTPException(status_code=404, detail="Job not found")
        return {k.decode(): v.decode() for k, v in status.items()}
    finally:
        await redis_client.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
