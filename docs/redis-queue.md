# Redis Streams — Transcription Task Queue

The transcription queue runs on Redis Streams instead of RabbitMQ. The main reason for the migration: RabbitMQ redelivered messages on consumer timeout when processing long audio files, creating duplicate utterances in the database (377k duplicates).

Redis Streams solves this: there is no automatic redelivery on timeout. A periodic XCLAIM heartbeat (every 20 sec) extends message ownership. Recovery from crashes is handled via XAUTOCLAIM (idle > 60 sec).

## Topology

| Key | Type | Purpose |
|-----|------|---------|
| `transcription:tasks` | Stream (consumer group `transcribers`) | Main task queue |
| `transcription:retry` | Sorted Set (score = unix timestamp) | Tasks scheduled for retry after 30 sec |
| `transcription:dlq` | Stream | Permanently failed tasks |
| `transcription:lock:{recording_id}` | String (SET NX EX) | Idempotency lock, TTL 24 hours |

## Processing Flow

### Successful Transcription

```
Next.js: XADD transcription:tasks * data {task_json}
         ↓
Consumer: XREADGROUP BLOCK 5000 COUNT 1
         ↓
SET transcription:lock:{recording_id} NX EX 86400
         ↓  (lock acquired)
Start heartbeat: XCLAIM every 20 sec
         ↓
Transcription (can take minutes)
         ↓
HTTP callback → POST /api/transcribe/callback
         ↓
XACK (acknowledge processing)
Stop heartbeat
```

### Error with Retry

```
Transcription → Exception
         ↓
ZADD transcription:retry {time()+30: task_json}  ← retry publish FIRST
         ↓
XACK (original message)
         ↓
DEL transcription:lock:{recording_id}  ← unlock for retry
```

### Permanent Error / Max Retries

```
Exception + (permanent error OR retry_count >= 3)
         ↓
XADD transcription:dlq * data {task_json with error}
         ↓
HTTP callback (status: failed)
         ↓
XACK + DEL lock
```

## Duplicate Protection (Three Levels)

| # | Mechanism | Where | How it works |
|---|-----------|-------|--------------|
| 1 | Ownership heartbeat | `redis_stream.py` | XCLAIM every 20 sec resets idle time — XAUTOCLAIM from another consumer won't steal the message |
| 2 | Idempotency lock | `redis_stream.py` | `SET transcription:lock:{recording_id} NX EX 86400` — second consumer skips (XACK + skip) |
| 3 | Transcribed check | `callback/route.ts` | `if (recording.transcribed) return` — callback won't insert duplicates into DB |

## Key Parameters

| Parameter | Value | Constant |
|-----------|-------|----------|
| Heartbeat interval | 20 sec | `HEARTBEAT_INTERVAL_SEC` |
| Autoclaim idle threshold | 60 sec | `AUTOCLAIM_IDLE_MS` |
| Lock TTL | 24 hours | `LOCK_TTL_SEC` |
| Retry delay | 30 sec | `RETRY_DELAY_SEC` |
| Max retries | 3 | `MAX_RETRIES` |
| Stream MAXLEN | ~1000 | `STREAM_MAXLEN` |
| Retry mover interval | 5 sec | (in `_retry_mover_loop`) |

## Retry Mover (Lua)

Every 5 seconds a Lua script atomically moves due tasks from the sorted set `transcription:retry` back to the stream:

```lua
local tasks = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 10)
for _, task in ipairs(tasks) do
    redis.call('XADD', KEYS[2], 'MAXLEN', '~', ARGV[2], '*', 'data', task)
    redis.call('ZREM', KEYS[1], task)
end
return #tasks
```

## Consumer Name

`socket.gethostname()` — Docker assigns a unique hostname to each container, ensuring unique consumer names when scaling.

## Files

| File | Role |
|------|------|
| `services/transcriber-py/app/services/redis_stream.py` | Consumer: XREADGROUP, heartbeat, lock, retry, DLQ |
| `app/src/lib/taskQueue.ts` | Producer: XADD (ioredis) |
| `app/src/app/api/transcribe/callback/route.ts` | Idempotency check at callback level |

## Monitoring

```bash
# Main queue length
docker exec tinkervoid-redis redis-cli XLEN transcription:tasks

# Pending messages (who is processing what)
docker exec tinkervoid-redis redis-cli XPENDING transcription:tasks transcribers

# Tasks in retry
docker exec tinkervoid-redis redis-cli ZCARD transcription:retry

# Tasks in DLQ
docker exec tinkervoid-redis redis-cli XLEN transcription:dlq

# Active locks
docker exec tinkervoid-redis redis-cli KEYS "transcription:lock:*"
```
