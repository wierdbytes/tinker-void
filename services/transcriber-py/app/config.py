from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # MinIO/S3
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin123"
    minio_bucket: str = "recordings"
    minio_use_ssl: bool = False

    # Redis
    redis_url: str = "redis://redis:6379"

    # RabbitMQ
    rabbitmq_url: str = "amqp://tinkervoid:tinkervoid_secret@rabbitmq:5672/"
    callback_base_url: str = "http://app:3000"
    callback_timeout: int = 30

    # Model settings
    model_size: str = "large-v3"
    model_path: str = "/app/models"
    cpu_threads: int = 4

    # Transcription defaults
    default_language: str = "ru"
    beam_size: int = 5
    vad_filter: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
