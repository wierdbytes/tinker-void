"""Redis Streams client for transcription task queue."""

import asyncio
import json
import logging
import socket
import time
from typing import Callable, Optional

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

# Stream/key names
STREAM_NAME = "transcription:tasks"
RETRY_KEY = "transcription:retry"
DLQ_STREAM = "transcription:dlq"
LOCK_PREFIX = "transcription:lock:"
GROUP_NAME = "transcribers"

# Settings
MAX_RETRIES = 3
RETRY_DELAY_SEC = 30
HEARTBEAT_INTERVAL_SEC = 20
AUTOCLAIM_IDLE_MS = 60_000  # 60 seconds
LOCK_TTL_SEC = 86400  # 24 hours
STREAM_MAXLEN = 1000

# Lua script: atomically move due tasks from retry sorted set to stream
RETRY_MOVER_LUA = """
local tasks = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 10)
for _, task in ipairs(tasks) do
    redis.call('XADD', KEYS[2], 'MAXLEN', '~', ARGV[2], '*', 'data', task)
    redis.call('ZREM', KEYS[1], task)
end
return #tasks
"""


class RedisStreamService:
    """Redis Streams consumer with ownership heartbeat and idempotency locks."""

    def __init__(self, redis_url: str, consumer_name: Optional[str] = None):
        self.redis_url = redis_url
        self.consumer_name = consumer_name or socket.gethostname()
        self._redis: Optional[aioredis.Redis] = None
        self._is_consuming = False
        self._retry_mover_script = None

    @property
    def is_connected(self) -> bool:
        return self._redis is not None

    async def connect(self) -> None:
        """Connect to Redis and create consumer group."""
        try:
            logger.info(f"Connecting to Redis at {self.redis_url}...")
            self._redis = aioredis.from_url(
                self.redis_url,
                decode_responses=True,
                retry_on_timeout=True,
            )
            # Verify connection
            await self._redis.ping()

            # Create consumer group (idempotent)
            try:
                await self._redis.xgroup_create(
                    STREAM_NAME, GROUP_NAME, id="0", mkstream=True
                )
                logger.info(f"Created consumer group '{GROUP_NAME}' on '{STREAM_NAME}'")
            except aioredis.ResponseError as e:
                if "BUSYGROUP" in str(e):
                    logger.info(f"Consumer group '{GROUP_NAME}' already exists")
                else:
                    raise

            # Register Lua script
            self._retry_mover_script = self._redis.register_script(RETRY_MOVER_LUA)

            logger.info(
                f"Connected to Redis, consumer='{self.consumer_name}'"
            )
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise

    async def close(self) -> None:
        """Close Redis connection."""
        self._is_consuming = False
        if self._redis:
            await self._redis.aclose()
            self._redis = None
            logger.info("Disconnected from Redis")

    async def consume(self, callback: Callable) -> None:
        """Main consume loop: XAUTOCLAIM stale + XREADGROUP new messages."""
        if not self._redis:
            raise RuntimeError("Not connected to Redis")

        self._is_consuming = True
        logger.info("Starting Redis Streams consumer...")

        # Start retry mover in background
        retry_task = asyncio.create_task(self._retry_mover_loop())

        try:
            while self._is_consuming:
                try:
                    # 1. Reclaim stale messages (consumer crashed)
                    await self._autoclaim_stale(callback)

                    # 2. Read new messages
                    results = await self._redis.xreadgroup(
                        GROUP_NAME,
                        self.consumer_name,
                        {STREAM_NAME: ">"},
                        count=1,
                        block=5000,
                    )

                    if results:
                        for _stream, messages in results:
                            for message_id, fields in messages:
                                await self._handle_message(
                                    message_id, fields, callback
                                )

                except aioredis.ConnectionError as e:
                    if not self._is_consuming:
                        break
                    logger.warning(f"Redis connection lost: {e}, reconnecting...")
                    await asyncio.sleep(5)
                    try:
                        await self.connect()
                    except Exception:
                        pass

                except asyncio.CancelledError:
                    logger.info("Consumer cancelled")
                    break

                except Exception as e:
                    if not self._is_consuming:
                        break
                    logger.error(f"Unexpected error in consumer: {e}")
                    await asyncio.sleep(5)

        finally:
            retry_task.cancel()
            try:
                await retry_task
            except asyncio.CancelledError:
                pass

        logger.info("Consumer stopped")

    async def _autoclaim_stale(self, callback: Callable) -> None:
        """Reclaim messages idle > AUTOCLAIM_IDLE_MS from other consumers."""
        try:
            result = await self._redis.xautoclaim(
                STREAM_NAME,
                GROUP_NAME,
                self.consumer_name,
                min_idle_time=AUTOCLAIM_IDLE_MS,
                start_id="0-0",
                count=1,
            )
            # result = [next_start_id, [(msg_id, fields), ...], deleted_ids]
            messages = result[1] if result and len(result) > 1 else []
            for message_id, fields in messages:
                if fields:  # Skip deleted messages
                    logger.warning(
                        f"[AUTOCLAIM] Reclaimed stale message {message_id}"
                    )
                    await self._handle_message(message_id, fields, callback)
        except Exception as e:
            logger.error(f"XAUTOCLAIM error: {e}")

    async def _handle_message(
        self, message_id: str, fields: dict, callback: Callable
    ) -> None:
        """Process a single message with idempotency lock and ownership heartbeat."""
        data_str = fields.get("data", "{}")
        try:
            task = json.loads(data_str)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in message {message_id}: {e}")
            await self._redis.xack(STREAM_NAME, GROUP_NAME, message_id)
            return

        recording_id = task.get("recording_id", "unknown")
        task_id = task.get("task_id", "unknown")

        logger.info(
            f"[TASK_RECEIVED] task_id={task_id} recording_id={recording_id} "
            f"message_id={message_id}"
        )

        # Idempotency lock: only one consumer processes a given recording
        lock_key = f"{LOCK_PREFIX}{recording_id}"
        lock_acquired = await self._redis.set(
            lock_key, self.consumer_name, nx=True, ex=LOCK_TTL_SEC
        )

        if not lock_acquired:
            logger.info(
                f"[SKIP] Recording {recording_id} already locked, skipping"
            )
            await self._redis.xack(STREAM_NAME, GROUP_NAME, message_id)
            return

        # Start ownership heartbeat
        stop_event = asyncio.Event()
        heartbeat_task = asyncio.create_task(
            self._ownership_heartbeat(message_id, stop_event)
        )

        try:
            await callback(task)
            # Success: ACK the message
            await self._redis.xack(STREAM_NAME, GROUP_NAME, message_id)
            logger.info(f"[ACK] message_id={message_id}")
        except Exception as e:
            logger.error(
                f"[TASK_ERROR] task_id={task_id} error={e}"
            )
            # Callback already published to retry/dlq internally.
            # ACK the original message so it doesn't stay in pending list.
            await self._redis.xack(STREAM_NAME, GROUP_NAME, message_id)
            # Delete lock so retry attempt can re-acquire it
            await self._redis.delete(lock_key)
            logger.info(f"[ACK+UNLOCK] message_id={message_id} lock released")
        finally:
            stop_event.set()
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

    async def _ownership_heartbeat(
        self, message_id: str, stop_event: asyncio.Event
    ) -> None:
        """Periodically XCLAIM to reset idle time, preventing XAUTOCLAIM by others."""
        while not stop_event.is_set():
            try:
                await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)
                if stop_event.is_set():
                    break
                await self._redis.xclaim(
                    STREAM_NAME,
                    GROUP_NAME,
                    self.consumer_name,
                    min_idle_time=0,
                    message_ids=[message_id],
                )
                logger.debug(f"[HEARTBEAT] Refreshed ownership of {message_id}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[HEARTBEAT] Error for {message_id}: {e}")

    async def _retry_mover_loop(self) -> None:
        """Background loop: move due tasks from retry sorted set back to stream."""
        while self._is_consuming:
            try:
                await asyncio.sleep(5)
                if not self._is_consuming:
                    break

                moved = await self._retry_mover_script(
                    keys=[RETRY_KEY, STREAM_NAME],
                    args=[str(int(time.time())), str(STREAM_MAXLEN)],
                )
                if moved and moved > 0:
                    logger.info(f"[RETRY_MOVER] Moved {moved} tasks back to stream")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[RETRY_MOVER] Error: {e}")

    async def publish_to_retry(self, task: dict) -> None:
        """Schedule task for retry after RETRY_DELAY_SEC."""
        if not self._redis:
            raise RuntimeError("Not connected to Redis")

        task_json = json.dumps(task)
        retry_at = time.time() + RETRY_DELAY_SEC
        await self._redis.zadd(RETRY_KEY, {task_json: retry_at})
        logger.info(
            f"Task sent to retry: task_id={task.get('task_id')} "
            f"retry_count={task.get('retry_count')}"
        )

    async def publish_to_dlq(self, task: dict, error: str) -> None:
        """Send permanently failed task to DLQ stream."""
        if not self._redis:
            raise RuntimeError("Not connected to Redis")

        task["error"] = error
        task["status"] = "failed"
        await self._redis.xadd(
            DLQ_STREAM,
            {"data": json.dumps(task)},
            maxlen=STREAM_MAXLEN,
            approximate=True,
        )
        logger.warning(
            f"Task sent to DLQ: task_id={task.get('task_id')} - {error}"
        )


# Global instance
_redis_stream_service: Optional[RedisStreamService] = None


async def get_redis_stream_service(
    redis_url: str,
    consumer_name: Optional[str] = None,
) -> RedisStreamService:
    """Get or create Redis Stream service instance."""
    global _redis_stream_service
    if _redis_stream_service is None:
        _redis_stream_service = RedisStreamService(
            redis_url, consumer_name=consumer_name
        )
        await _redis_stream_service.connect()
    return _redis_stream_service


async def close_redis_stream_service() -> None:
    """Close Redis Stream service."""
    global _redis_stream_service
    if _redis_stream_service:
        await _redis_stream_service.close()
        _redis_stream_service = None
