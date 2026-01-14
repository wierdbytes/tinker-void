import logging
from typing import Optional

import redis.asyncio as redis

logger = logging.getLogger(__name__)


class QueueService:
    """Redis-based job tracking."""

    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url, decode_responses=True)

    async def set_job_status(
        self,
        job_id: str,
        status: str,
        current: Optional[int] = None,
        total: Optional[int] = None,
    ) -> None:
        """Update job status in Redis."""
        key = f"transcribe:job:{job_id}"

        data = {"status": status}
        if current is not None:
            data["current"] = str(current)
        if total is not None:
            data["total"] = str(total)

        await self.redis.hset(key, mapping=data)
        await self.redis.expire(key, 86400)  # 24 hours

        logger.info(f"Updated job {job_id}: {status}")

    async def get_job_status(self, job_id: str) -> Optional[dict]:
        """Get job status from Redis."""
        key = f"transcribe:job:{job_id}"
        data = await self.redis.hgetall(key)

        if not data:
            return None

        return {
            "status": data.get("status", "unknown"),
            "current": int(data["current"]) if "current" in data else None,
            "total": int(data["total"]) if "total" in data else None,
        }

    async def set_transcription_result(
        self,
        recording_id: str,
        status: str,
        text: Optional[str] = None,
        duration: Optional[float] = None,
        error: Optional[str] = None,
    ) -> None:
        """Store transcription result."""
        key = f"transcribe:result:{recording_id}"

        data = {"status": status}
        if text:
            data["text"] = text
        if duration:
            data["duration"] = str(duration)
        if error:
            data["error"] = error

        await self.redis.hset(key, mapping=data)
        await self.redis.expire(key, 604800)  # 7 days

    async def close(self):
        await self.redis.close()
