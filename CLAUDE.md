# CLAUDE.md - TinkerVoid Project Context

## Project Description

TinkerVoid — a web application for team video/voice meetings with features:
- Video conferencing with adaptive grid layout (LiveKit, self-hosted)
- Screen sharing with participant sidebar
- Automatic recording of each participant separately (LiveKit Egress → MinIO)
- Speech-to-text transcription (faster-whisper on CPU)
- Meeting summarization (Claude API)
- Dialogue with participant names and timestamps

## Tech Stack

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes
- **Database:** PostgreSQL + Prisma ORM
- **Voice:** LiveKit (self-hosted, v1.9.11)
- **Recording:** LiveKit Egress → MinIO (S3)
- **Transcription:** faster-whisper large-v3-turbo (Python, runs on CPU) — [details](docs/TRANSCRIBER.md)
- **Alternative Transcription:** Deepgram API (optional, on-demand)
- **Task Queue:** RabbitMQ 4.x (async transcription)
- **Summarization:** Claude API (Anthropic)
- **File Storage:** MinIO (S3-compatible)
- **Containerization:** Docker Compose

## Recording and Transcription Architecture

```
Participant enables microphone
         ↓
LiveKit: track_published webhook
         ↓
Next.js: startTrackRecording() → LiveKit Egress API
         ↓
Egress records audio to MinIO (OGG format)
         ↓
Participant leaves / room closes
         ↓
LiveKit: egress_ended webhook
         ↓
Next.js: saves Recording to DB
         ↓
LiveKit: room_finished webhook
         ↓
Next.js: POST /api/transcribe → publish to RabbitMQ
         ↓
RabbitMQ: transcription.tasks queue
         ↓
Transcriber Consumer: downloads OGG from MinIO, converts to WAV, transcribes
         ↓
Transcriber: HTTP callback → POST /api/transcribe/callback
         ↓
Next.js: saves Utterances to DB
         ↓
Next.js: POST /api/summarize → Claude API
         ↓
Meeting status: COMPLETED
```

## Project Structure

```
tinkervoid/
├── docs/                         # Documentation
│   └── TRANSCRIBER.md            # Transcriber details
├── app/                          # Next.js application
│   ├── src/
│   │   ├── app/                  # Pages and API routes
│   │   │   ├── page.tsx          # Home (lobby)
│   │   │   ├── s/[secretId]/     # Room page (by secret link)
│   │   │   │   ├── history/      # Meeting history
│   │   │   │   └── meetings/[id] # Meeting details
│   │   │   └── api/
│   │   │       ├── livekit/
│   │   │       │   ├── token/    # Token generation
│   │   │       │   └── webhook/  # LiveKit event handling
│   │   │       ├── transcribe/   # Transcription trigger
│   │   │       └── summarize/    # Summarization via Claude
│   │   ├── components/           # React components
│   │   │   ├── room/             # VideoRoom, participant tiles
│   │   │   ├── video/            # Video preview, useVideoDevices hook
│   │   │   ├── audio/            # Audio device selection, level meter
│   │   │   └── media/            # Media toggles (mic/camera)
│   │   └── lib/
│   │       ├── livekit.ts        # LiveKit client and startTrackRecording()
│   │       ├── rabbitmq.ts       # RabbitMQ publisher for transcription tasks
│   │       ├── deepgram.ts       # Deepgram API client (alternative transcription)
│   │       ├── claude.ts         # Claude API client
│   │       └── prisma.ts         # Prisma client
│   ├── prisma/schema.prisma      # DB schema
│   └── .env.local                # Environment variables
├── services/
│   ├── livekit/
│   │   ├── livekit.yaml          # LiveKit server configuration
│   │   └── egress.yaml           # Egress configuration
│   └── transcriber-py/           # Transcription service (Python)
│       ├── Dockerfile
│       └── app/
│           ├── main.py           # FastAPI HTTP server + RabbitMQ consumer
│           ├── consumer.py       # RabbitMQ consumer for transcription tasks
│           ├── config.py         # Settings from env
│           └── services/
│               ├── transcriber.py # faster-whisper + sentence splitting
│               ├── rabbitmq.py    # RabbitMQ client (aio-pika)
│               ├── storage.py     # MinIO client
│               └── audio.py       # ffmpeg conversion
└── docker-compose.yml
```

## Commands

### Initial Setup
```bash
./scripts/setup.sh
```

### Start All Services
```bash
# Infrastructure
docker compose up -d postgres redis rabbitmq minio livekit livekit-egress transcriber

# Make recordings bucket public (required!)
docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin123
docker compose exec minio mc mb local/recordings --ignore-existing
docker compose exec minio mc anonymous set download local/recordings

# Next.js
cd app && npm run dev
```

### Rebuild Transcriber (after changes)
```bash
docker compose build transcriber
docker compose up -d transcriber
```

### Prisma
```bash
cd app
npm run db:generate    # Generate client
npm run db:push        # Apply schema
npm run db:studio      # DB GUI
```

### Logs
```bash
docker compose logs -f livekit          # LiveKit server
docker compose logs -f livekit-egress   # Egress (recording)
docker compose logs -f transcriber      # Transcription
docker compose logs -f rabbitmq         # RabbitMQ
```

### Production Deployment
```bash
./scripts/deploy.sh              # Interactive setup and deploy
./scripts/deploy.sh --init       # Initialize config (generate passwords)
./scripts/deploy.sh --start      # Start all services
./scripts/deploy.sh --stop       # Stop all services
./scripts/deploy.sh --restart    # Restart all services
./scripts/deploy.sh --logs       # View logs
./scripts/deploy.sh --logs app   # Logs for specific service
./scripts/deploy.sh --status     # Service status
./scripts/deploy.sh --update     # Update and restart
./scripts/deploy.sh --migrate    # Database migrations
./scripts/deploy.sh --traefik-on  # Enable Traefik reverse proxy
./scripts/deploy.sh --traefik-off # Disable Traefik reverse proxy
```

## Environment Variables

File `app/.env.local`:
```env
# Public
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://tinkervoid:tinkervoid_secret@localhost:5432/tinkervoid

# LiveKit
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret123456789012345678901234567890

# MinIO (for host)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=recordings

# RabbitMQ
RABBITMQ_URL=amqp://tinkervoid:tinkervoid_secret@localhost:5672/

# Claude API (REQUIRED for summarization)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Deepgram API (optional - for alternative transcription)
DEEPGRAM_API_KEY=
DEEPGRAM_MODEL=nova-3
DEEPGRAM_LANGUAGE=multi  # 'multi' for multilingual, or 'ru', 'en', etc.
```

## Important Implementation Details

### 1. Starting Recording on track_published
File: `app/src/app/api/livekit/webhook/route.ts`

On `track_published` event, track type is checked (can be `0` or `'AUDIO'`) and recording starts:
```typescript
const isAudio = track.type === 0 || track.type === 'AUDIO'
if (isAudio) {
  await startTrackRecording(roomName, trackSid, participantIdentity)
}
```

### 2. OGG → WAV Conversion
File: `services/transcriber-py/app/services/audio.py`

LiveKit Egress records in OGG (Opus), but Whisper requires WAV. Transcriber automatically converts via ffmpeg:
```bash
ffmpeg -i input.ogg -ar 16000 -ac 1 -f wav output.wav
```

### 3. Duration as BigInt
File: `app/src/app/api/livekit/webhook/route.ts`

LiveKit returns `duration` as BigInt in nanoseconds. Conversion to seconds:
```typescript
const durationSec = Number(durationNs) / 1_000_000_000
```

### 4. S3 Upload for Egress
File: `app/src/lib/livekit.ts`

Egress runs inside Docker, so MinIO endpoint is: `http://minio:9000`

### 5. Async Transcription via RabbitMQ
File: `app/src/app/api/transcribe/route.ts`

Next.js publishes tasks to RabbitMQ queue `transcription.tasks`. Transcriber consumer processes tasks asynchronously and sends results via HTTP callback to `/api/transcribe/callback`.

Queue structure:
- `transcription.tasks` — main task queue
- `transcription.retry` — retry attempts (30 sec delay)
- `transcription.dlq` — failed tasks for analysis

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rooms` | POST | Create room |
| `/api/livekit/token` | POST | Generate LiveKit token |
| `/api/livekit/webhook` | POST | Handle LiveKit events |
| `/api/meetings/[id]?secretId=` | GET | Meeting details (requires secretId) |
| `/api/meetings/[id]/audio?secretId=` | GET | Download merged audio (requires secretId) |
| `/api/transcribe` | POST | Queue transcription tasks |
| `/api/transcribe/callback` | POST | Callback from transcriber with results |
| `/api/transcribe/deepgram` | POST | On-demand Deepgram transcription |
| `/api/transcribe/deepgram/status` | GET | Check Deepgram availability |
| `/api/summarize` | POST | Summarization via Claude |

## Database Schema

- **Room** — meeting rooms
- **Meeting** — meetings (status: IN_PROGRESS → PROCESSING → COMPLETED/FAILED)
- **Participant** — meeting participants (identity, name, joinedAt, leftAt)
- **Recording** — audio recordings (fileUrl, duration, transcribed, deepgramTranscribed)
- **Utterance** — transcript phrases (text, startTime, endTime, source: WHISPER|DEEPGRAM)

## Ports

| Port | Service |
|------|---------|
| 3000 | Next.js |
| 5432 | PostgreSQL |
| 5672 | RabbitMQ AMQP |
| 6379 | Redis |
| 7880 | LiveKit HTTP/WebSocket |
| 7881 | LiveKit RTC (TCP) |
| 7882 | LiveKit RTC (UDP) |
| 8001 | Transcriber (health check) |
| 9000 | MinIO API |
| 9001 | MinIO Console |
| 15672 | RabbitMQ Management UI |

## Known Issues

### RED Codec in Chrome
LiveKit v1.9.8 may crash with panic on second participant from Chrome due to RED codec.

**Solution** in `VideoRoom.tsx`:
```typescript
const room = new Room({
  audioCaptureDefaults: { red: false },
})
```

### Webhook on Linux
`host.docker.internal` doesn't work on Linux. Use host IP or configure network.

## Transcription Service (transcriber-py)

**Detailed documentation:** [docs/TRANSCRIBER.md](docs/TRANSCRIBER.md)

**Technologies:** Python + faster-whisper + ffmpeg + aio-pika (RabbitMQ)
**Model:** Whisper large-v3-turbo (INT8, ~1.5GB)
**Format:** Accepts any audio format (converts to WAV 16kHz mono)

### Key Features
- Async processing via RabbitMQ consumer
- Runs on CPU (including Apple Silicon)
- Performance ~10-15x realtime
- Sentence splitting by punctuation
- First word timing correction (see documentation)
- Retry mechanism (3 attempts with 30 sec delay)
- Dead Letter Queue for failed tasks

### HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | `{"status": "healthy", "model_loaded": true, "rabbitmq_connected": true}` |

### Health Check
```bash
curl http://localhost:8001/health

# Check task queue
docker exec tinkervoid-rabbitmq rabbitmqctl list_queues name messages
```

## Deepgram API (Alternative Transcription)

Optional cloud-based transcription service as an alternative to self-hosted Whisper.

### Configuration
1. Get API key at https://console.deepgram.com
2. Add to `.env.local` or `.env.prod`:
```env
DEEPGRAM_API_KEY=your_api_key
DEEPGRAM_MODEL=nova-3
DEEPGRAM_LANGUAGE=multi  # or 'ru', 'en', 'es', etc.
```

### Features
- On-demand transcription (triggered by user)
- **Multilingual Code Switching** (`DEEPGRAM_LANGUAGE=multi`) — auto-detects and transcribes mixed-language audio
- Models: nova-3 (latest), nova-2 (36 languages)
- Results stored separately with `source: DEEPGRAM`

### How It Works
1. Whisper transcription runs automatically after meeting ends
2. User can request Deepgram transcription via UI switcher
3. Both transcriptions are stored and can be switched between
4. Deepgram reads audio from MinIO (same as Whisper)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transcribe/deepgram/status` | GET | `{"available": true, "model": "nova-3"}` |
| `/api/transcribe/deepgram` | POST | Transcribe meeting (body: `{meetingId, secretId}`) |

### Cost Considerations
- Deepgram is a paid cloud service (billed per audio minute)
- Whisper remains free (self-hosted)
- Deepgram only runs when explicitly requested by user

## Admin Panel (/void)

Hidden admin panel for managing rooms and meetings.

### Access
- URL: `/void` (not linked from main interface)
- Protection: static key `ADMIN_SECRET_KEY` from `.env.local`
- Authorization via form on entry

### Features
- View statistics (online, rooms, meetings, recordings)
- Room management (view, copy link, delete)
- Meeting monitoring (status, participants, duration)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/void/auth` | POST | Verify access key |
| `/api/void/stats` | GET | General statistics |
| `/api/void/rooms` | GET | List rooms |
| `/api/void/rooms` | DELETE | Delete room |
| `/api/void/meetings` | GET | List meetings |

All API endpoints (except auth) require header `Authorization: Bearer <ADMIN_SECRET_KEY>`
