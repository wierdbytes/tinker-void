import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.consumer import start_consumer, stop_consumer
from app.models.schemas import HealthResponse
from app.services.rabbitmq import close_rabbitmq_service
from app.services.storage import StorageService
from app.services.transcriber import (
    TranscriberService,
    get_transcription_executor,
    shutdown_transcription_executor,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global services
transcriber: TranscriberService = None
storage: StorageService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    global transcriber, storage

    settings = get_settings()

    # Initialize transcription thread pool
    logger.info(f"Initializing transcription executor with {settings.transcription_workers} workers...")
    get_transcription_executor(max_workers=settings.transcription_workers)

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

    # Start RabbitMQ consumer
    logger.info(f"Starting RabbitMQ consumer (heartbeat={settings.rabbitmq_heartbeat}s)...")
    await start_consumer(transcriber, storage)
    logger.info("RabbitMQ consumer started!")

    logger.info("All services initialized!")

    yield

    # Cleanup
    logger.info("Shutting down...")
    await stop_consumer()
    await close_rabbitmq_service()
    shutdown_transcription_executor()
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
    from app.services.rabbitmq import _rabbitmq_service

    return HealthResponse(
        status="healthy",
        model_loaded=transcriber.model_loaded if transcriber else False,
        rabbitmq_connected=_rabbitmq_service.is_connected if _rabbitmq_service else False,
    )


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(app, host=settings.host, port=settings.port)
