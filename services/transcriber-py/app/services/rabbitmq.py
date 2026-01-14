"""RabbitMQ client for transcription task queue."""

import asyncio
import json
import logging
from typing import Callable, Optional

import aio_pika
from aio_pika import ExchangeType, Message
from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractQueue

logger = logging.getLogger(__name__)

# Queue configuration
EXCHANGE_NAME = "transcription"
TASKS_QUEUE = "transcription.tasks"
RETRY_QUEUE = "transcription.retry"
DLQ_QUEUE = "transcription.dlq"

# Retry settings
MAX_RETRIES = 3
RETRY_DELAY_MS = 30000  # 30 seconds


class RabbitMQService:
    """RabbitMQ client with automatic reconnection."""

    def __init__(self, url: str):
        self.url = url
        self._connection: Optional[AbstractConnection] = None
        self._channel: Optional[AbstractChannel] = None
        self._tasks_queue: Optional[AbstractQueue] = None
        self._is_consuming = False

    @property
    def is_connected(self) -> bool:
        return self._connection is not None and not self._connection.is_closed

    async def connect(self) -> None:
        """Establish connection to RabbitMQ."""
        try:
            self._connection = await aio_pika.connect_robust(
                self.url,
                reconnect_interval=5,
            )
            self._channel = await self._connection.channel()
            await self._channel.set_qos(prefetch_count=1)

            # Declare exchange
            exchange = await self._channel.declare_exchange(
                EXCHANGE_NAME,
                ExchangeType.TOPIC,
                durable=True,
            )

            # Declare DLQ first (needed for tasks queue)
            dlq = await self._channel.declare_queue(
                DLQ_QUEUE,
                durable=True,
            )
            await dlq.bind(exchange, routing_key="transcription.failed")

            # Declare retry queue with TTL -> routes back to tasks
            retry_queue = await self._channel.declare_queue(
                RETRY_QUEUE,
                durable=True,
                arguments={
                    "x-message-ttl": RETRY_DELAY_MS,
                    "x-dead-letter-exchange": EXCHANGE_NAME,
                    "x-dead-letter-routing-key": "transcription.task",
                },
            )
            await retry_queue.bind(exchange, routing_key="transcription.retry")

            # Declare main tasks queue
            self._tasks_queue = await self._channel.declare_queue(
                TASKS_QUEUE,
                durable=True,
                arguments={
                    "x-dead-letter-exchange": EXCHANGE_NAME,
                    "x-dead-letter-routing-key": "transcription.failed",
                },
            )
            await self._tasks_queue.bind(exchange, routing_key="transcription.task")

            logger.info("Connected to RabbitMQ")

        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise

    async def close(self) -> None:
        """Close connection."""
        self._is_consuming = False
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
            logger.info("Disconnected from RabbitMQ")

    async def publish_to_retry(self, message_body: dict) -> None:
        """Publish message to retry queue."""
        if not self._channel:
            raise RuntimeError("Not connected to RabbitMQ")

        exchange = await self._channel.get_exchange(EXCHANGE_NAME)
        await exchange.publish(
            Message(
                body=json.dumps(message_body).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key="transcription.retry",
        )
        logger.info(f"Message sent to retry queue: {message_body.get('task_id')}")

    async def publish_to_dlq(self, message_body: dict, error: str) -> None:
        """Publish message to dead letter queue."""
        if not self._channel:
            raise RuntimeError("Not connected to RabbitMQ")

        message_body["error"] = error
        message_body["status"] = "failed"

        exchange = await self._channel.get_exchange(EXCHANGE_NAME)
        await exchange.publish(
            Message(
                body=json.dumps(message_body).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key="transcription.failed",
        )
        logger.warning(f"Message sent to DLQ: {message_body.get('task_id')} - {error}")

    async def consume(
        self,
        callback: Callable[[dict], None],
    ) -> None:
        """Start consuming messages from tasks queue."""
        if not self._tasks_queue:
            raise RuntimeError("Not connected to RabbitMQ")

        self._is_consuming = True
        logger.info("Starting to consume transcription tasks...")

        async with self._tasks_queue.iterator() as queue_iter:
            async for message in queue_iter:
                if not self._is_consuming:
                    break

                async with message.process():
                    try:
                        task = json.loads(message.body.decode())
                        logger.info(
                            f"[TASK_RECEIVED] task_id={task.get('task_id')} "
                            f"recording_id={task.get('recording_id')}"
                        )
                        await callback(task)
                    except json.JSONDecodeError as e:
                        logger.error(f"Invalid JSON in message: {e}")
                    except Exception as e:
                        logger.error(f"Error processing message: {e}")
                        # Don't requeue - let the callback handle retry logic


# Global instance
_rabbitmq_service: Optional[RabbitMQService] = None


async def get_rabbitmq_service(url: str) -> RabbitMQService:
    """Get or create RabbitMQ service instance."""
    global _rabbitmq_service
    if _rabbitmq_service is None:
        _rabbitmq_service = RabbitMQService(url)
        await _rabbitmq_service.connect()
    return _rabbitmq_service


async def close_rabbitmq_service() -> None:
    """Close RabbitMQ service."""
    global _rabbitmq_service
    if _rabbitmq_service:
        await _rabbitmq_service.close()
        _rabbitmq_service = None
