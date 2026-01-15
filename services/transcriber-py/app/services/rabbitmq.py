"""RabbitMQ client for transcription task queue."""

import asyncio
import json
import logging
from typing import Callable, Optional

import aio_pika
from aio_pika import ExchangeType, Message
from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractQueue
from aio_pika.pool import Pool

logger = logging.getLogger(__name__)

# Queue configuration
EXCHANGE_NAME = "transcription"
TASKS_QUEUE = "transcription.tasks"
RETRY_QUEUE = "transcription.retry"
DLQ_QUEUE = "transcription.dlq"

# Retry settings
MAX_RETRIES = 3
RETRY_DELAY_MS = 30000  # 30 seconds

# Connection settings
DEFAULT_HEARTBEAT = 300  # 5 minutes - gives plenty of time for long transcriptions
DEFAULT_RECONNECT_INTERVAL = 5


class RabbitMQService:
    """RabbitMQ client with automatic reconnection and heartbeat management."""

    def __init__(
        self,
        url: str,
        heartbeat: int = DEFAULT_HEARTBEAT,
        reconnect_interval: int = DEFAULT_RECONNECT_INTERVAL,
    ):
        self.url = url
        self.heartbeat = heartbeat
        self.reconnect_interval = reconnect_interval
        self._connection: Optional[AbstractConnection] = None
        self._channel: Optional[AbstractChannel] = None
        self._tasks_queue: Optional[AbstractQueue] = None
        self._is_consuming = False
        self._consumer_callback: Optional[Callable] = None
        self._consume_task: Optional[asyncio.Task] = None

    @property
    def is_connected(self) -> bool:
        return (
            self._connection is not None
            and not self._connection.is_closed
            and self._channel is not None
            and not self._channel.is_closed
        )

    async def connect(self) -> None:
        """Establish connection to RabbitMQ with heartbeat configuration."""
        try:
            logger.info(f"Connecting to RabbitMQ with heartbeat={self.heartbeat}s...")

            self._connection = await aio_pika.connect_robust(
                self.url,
                heartbeat=self.heartbeat,
                reconnect_interval=self.reconnect_interval,
            )

            # Set up connection close callback for logging
            self._connection.close_callbacks.add(self._on_connection_close)

            self._channel = await self._connection.channel()
            await self._channel.set_qos(prefetch_count=1)

            # Set up channel close callback
            self._channel.close_callbacks.add(self._on_channel_close)

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

    def _on_connection_close(
        self, connection: AbstractConnection, exception: Optional[BaseException]
    ) -> None:
        """Callback when connection is closed."""
        if exception:
            logger.warning(f"RabbitMQ connection closed with exception: {exception}")
        else:
            logger.info("RabbitMQ connection closed normally")

    def _on_channel_close(
        self, channel: AbstractChannel, exception: Optional[BaseException]
    ) -> None:
        """Callback when channel is closed."""
        if exception:
            logger.warning(f"RabbitMQ channel closed with exception: {exception}")
        else:
            logger.info("RabbitMQ channel closed normally")

    async def close(self) -> None:
        """Close connection."""
        self._is_consuming = False

        # Cancel consume task if running
        if self._consume_task and not self._consume_task.done():
            self._consume_task.cancel()
            try:
                await self._consume_task
            except asyncio.CancelledError:
                pass

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
        """Start consuming messages from tasks queue with automatic reconnection."""
        if not self._tasks_queue:
            raise RuntimeError("Not connected to RabbitMQ")

        self._is_consuming = True
        self._consumer_callback = callback
        logger.info("Starting to consume transcription tasks...")

        while self._is_consuming:
            try:
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

            except aio_pika.exceptions.ChannelClosed as e:
                if not self._is_consuming:
                    break
                logger.warning(f"Channel closed during consumption: {e}")
                logger.info("Waiting for automatic reconnection...")
                await asyncio.sleep(self.reconnect_interval)

            except aio_pika.exceptions.ConnectionClosed as e:
                if not self._is_consuming:
                    break
                logger.warning(f"Connection closed during consumption: {e}")
                logger.info("Waiting for automatic reconnection...")
                await asyncio.sleep(self.reconnect_interval)

            except asyncio.CancelledError:
                logger.info("Consumer cancelled")
                break

            except Exception as e:
                if not self._is_consuming:
                    break
                logger.error(f"Unexpected error in consumer: {e}")
                await asyncio.sleep(self.reconnect_interval)

        logger.info("Consumer stopped")


# Global instance
_rabbitmq_service: Optional[RabbitMQService] = None


async def get_rabbitmq_service(
    url: str,
    heartbeat: int = DEFAULT_HEARTBEAT,
) -> RabbitMQService:
    """Get or create RabbitMQ service instance."""
    global _rabbitmq_service
    if _rabbitmq_service is None:
        _rabbitmq_service = RabbitMQService(url, heartbeat=heartbeat)
        await _rabbitmq_service.connect()
    return _rabbitmq_service


async def close_rabbitmq_service() -> None:
    """Close RabbitMQ service."""
    global _rabbitmq_service
    if _rabbitmq_service:
        await _rabbitmq_service.close()
        _rabbitmq_service = None
