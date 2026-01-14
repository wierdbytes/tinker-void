import asyncio
import logging
from pathlib import Path

from minio import Minio

logger = logging.getLogger(__name__)


class StorageService:
    """MinIO S3 storage client."""

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        secure: bool = False,
    ):
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        self.bucket = bucket

    def normalize_object_key(self, file_url: str) -> str:
        """Normalize file URL to object key.

        Handles various formats:
        - "recordings/meeting-123/user-456.ogg"
        - "meeting-123/user-456.ogg"
        """
        if file_url.startswith(f"{self.bucket}/"):
            return file_url[len(self.bucket) + 1 :]
        return file_url

    async def download_file(self, object_key: str, local_path: Path) -> None:
        """Download file from MinIO to local path."""
        object_key = self.normalize_object_key(object_key)
        logger.info(f"Downloading {object_key} to {local_path}")

        # minio-py is sync, run in executor
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self.client.fget_object(self.bucket, object_key, str(local_path)),
        )

        logger.info(f"Downloaded {object_key}")
