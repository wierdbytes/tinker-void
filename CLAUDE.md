# CLAUDE.md - Контекст проекта TinkerVoid

## Описание проекта

TinkerVoid — веб-приложение для голосовых встреч команды с функциями:
- Голосовая связь через LiveKit (self-hosted)
- Автоматическая запись каждого участника отдельно (LiveKit Egress → MinIO)
- Транскрибация речи в текст (faster-whisper на CPU)
- Суммаризация встреч (Claude API)
- Диалог с именами участников и временными метками

## Технологический стек

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes
- **База данных:** PostgreSQL + Prisma ORM
- **Голосовая связь:** LiveKit (self-hosted, v1.9.8)
- **Запись:** LiveKit Egress → MinIO (S3)
- **Транскрибация:** faster-whisper large-v3-turbo (Python, работает на CPU) — [подробнее](docs/TRANSCRIBER.md)
- **Суммаризация:** Claude API (Anthropic)
- **Хранение файлов:** MinIO (S3-совместимое)
- **Контейнеризация:** Docker Compose

## Архитектура записи и транскрибации

```
Участник включает микрофон
         ↓
LiveKit: track_published webhook
         ↓
Next.js: startTrackRecording() → LiveKit Egress API
         ↓
Egress записывает аудио в MinIO (OGG формат)
         ↓
Участник выходит / комната закрывается
         ↓
LiveKit: egress_ended webhook
         ↓
Next.js: сохраняет Recording в БД
         ↓
LiveKit: room_finished webhook
         ↓
Next.js: POST /api/transcribe
         ↓
Transcriber: скачивает OGG из MinIO, конвертирует в WAV (ffmpeg), транскрибирует
         ↓
Next.js: сохраняет Utterances в БД
         ↓
Next.js: POST /api/summarize → Claude API
         ↓
Meeting status: COMPLETED
```

## Структура проекта

```
tinkervoid/
├── docs/                         # Документация
│   └── TRANSCRIBER.md            # Подробности по транскрибатору
├── app/                          # Next.js приложение
│   ├── src/
│   │   ├── app/                  # Pages и API routes
│   │   │   ├── page.tsx          # Главная (лобби)
│   │   │   ├── room/[roomId]/    # Страница комнаты
│   │   │   ├── meetings/         # История встреч
│   │   │   └── api/
│   │   │       ├── livekit/
│   │   │       │   ├── token/    # Генерация токенов
│   │   │       │   └── webhook/  # Обработка событий LiveKit
│   │   │       ├── transcribe/   # Запуск транскрибации
│   │   │       └── summarize/    # Суммаризация через Claude
│   │   ├── components/           # React компоненты
│   │   └── lib/
│   │       ├── livekit.ts        # LiveKit клиент и startTrackRecording()
│   │       ├── claude.ts         # Claude API клиент
│   │       └── prisma.ts         # Prisma клиент
│   ├── prisma/schema.prisma      # Схема БД
│   └── .env.local                # Переменные окружения
├── services/
│   ├── livekit/
│   │   ├── livekit.yaml          # Конфигурация LiveKit сервера
│   │   └── egress.yaml           # Конфигурация Egress
│   └── transcriber-py/           # Сервис транскрибации (Python)
│       ├── Dockerfile
│       └── app/
│           ├── main.py           # FastAPI HTTP сервер
│           ├── config.py         # Настройки из env
│           └── services/
│               ├── transcriber.py # faster-whisper + sentence splitting
│               ├── storage.py     # MinIO клиент
│               └── audio.py       # ffmpeg конвертация
└── docker-compose.yml
```

## Команды

### Первоначальная настройка
```bash
./scripts/setup.sh
```

### Запуск всех сервисов
```bash
# Инфраструктура
docker compose up -d postgres redis minio livekit livekit-egress transcriber

# Сделать бакет recordings публичным (обязательно!)
docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin123
docker compose exec minio mc mb local/recordings --ignore-existing
docker compose exec minio mc anonymous set download local/recordings

# Next.js
cd app && npm run dev
```

### Пересборка транскрибатора (после изменений)
```bash
docker compose build transcriber
docker compose up -d transcriber
```

### Prisma
```bash
cd app
npm run db:generate    # Генерация клиента
npm run db:push        # Применение схемы
npm run db:studio      # GUI для БД
```

### Логи
```bash
docker compose logs -f livekit          # LiveKit сервер
docker compose logs -f livekit-egress   # Egress (запись)
docker compose logs -f transcriber      # Транскрибация
```

### Production Deployment
```bash
./scripts/deploy.sh              # Интерактивная настройка и деплой
./scripts/deploy.sh --init       # Инициализация конфига (генерация паролей)
./scripts/deploy.sh --start      # Запуск всех сервисов
./scripts/deploy.sh --stop       # Остановка всех сервисов
./scripts/deploy.sh --restart    # Перезапуск всех сервисов
./scripts/deploy.sh --logs       # Просмотр логов
./scripts/deploy.sh --logs app   # Логи конкретного сервиса
./scripts/deploy.sh --status     # Статус сервисов
./scripts/deploy.sh --update     # Обновление и перезапуск
./scripts/deploy.sh --migrate    # Миграции базы данных
./scripts/deploy.sh --traefik-on  # Включить Traefik reverse proxy
./scripts/deploy.sh --traefik-off # Отключить Traefik reverse proxy
```

## Переменные окружения

Файл `app/.env.local`:
```env
# Public
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://tinkervoid:tinkervoid_secret@localhost:5432/tinkervoid

# LiveKit
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret123456789012345678901234567890

# MinIO (для хоста)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=recordings

# Transcriber
TRANSCRIBER_URL=http://localhost:8001

# Claude API (ОБЯЗАТЕЛЬНО для суммаризации)
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## Важные детали реализации

### 1. Запуск записи при track_published
Файл: `app/src/app/api/livekit/webhook/route.ts`

При событии `track_published` проверяется тип трека (может быть `0` или `'AUDIO'`) и запускается запись:
```typescript
const isAudio = track.type === 0 || track.type === 'AUDIO'
if (isAudio) {
  await startTrackRecording(roomName, trackSid, participantIdentity)
}
```

### 2. Конвертация OGG → WAV
Файл: `services/transcriber-py/app/services/audio.py`

LiveKit Egress записывает в OGG (Opus), но Whisper требует WAV. Транскрибатор автоматически конвертирует через ffmpeg:
```bash
ffmpeg -i input.ogg -ar 16000 -ac 1 -f wav output.wav
```

### 3. Duration как BigInt
Файл: `app/src/app/api/livekit/webhook/route.ts`

LiveKit возвращает `duration` как BigInt в наносекундах. Конвертация в секунды:
```typescript
const durationSec = Number(durationNs) / 1_000_000_000
```

### 4. S3 Upload для Egress
Файл: `app/src/lib/livekit.ts`

Egress работает внутри Docker, поэтому endpoint MinIO: `http://minio:9000`

### 5. Транскрибатор получает относительный путь
Файл: `app/src/app/api/transcribe/route.ts`

Транскрибатор имеет собственное подключение к MinIO, поэтому ему отправляется только `recording.fileUrl` (относительный путь), а не полный URL.

## API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/rooms` | POST | Создание комнаты |
| `/api/livekit/token` | POST | Генерация токена LiveKit |
| `/api/livekit/webhook` | POST | Обработка событий LiveKit |
| `/api/meetings` | GET | Список встреч |
| `/api/meetings/[id]` | GET | Детали встречи |
| `/api/transcribe` | POST | Запуск транскрибации |
| `/api/summarize` | POST | Суммаризация через Claude |

## Схема базы данных

- **Room** — комнаты для встреч
- **Meeting** — встречи (статус: IN_PROGRESS → PROCESSING → COMPLETED/FAILED)
- **Participant** — участники встречи (identity, name, joinedAt, leftAt)
- **Recording** — записи аудио (fileUrl, duration, transcribed)
- **Utterance** — фразы транскрипта (text, startTime, endTime)

## Порты

| Порт | Сервис |
|------|--------|
| 3000 | Next.js |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 7880 | LiveKit HTTP/WebSocket |
| 7881 | LiveKit RTC (TCP) |
| 7882 | LiveKit RTC (UDP) |
| 8001 | Transcriber |
| 9000 | MinIO API |
| 9001 | MinIO Console |

## Известные проблемы

### RED кодек в Chrome
LiveKit v1.9.8 может падать с panic при втором участнике из Chrome из-за RED кодека.

**Решение** в `VideoRoom.tsx`:
```typescript
const room = new Room({
  audioCaptureDefaults: { red: false },
})
```

### Webhook на Linux
`host.docker.internal` не работает на Linux. Нужно использовать IP хоста или настроить network.

## Сервис транскрибации (transcriber-py)

**Подробная документация:** [docs/TRANSCRIBER.md](docs/TRANSCRIBER.md)

**Технологии:** Python + faster-whisper + ffmpeg
**Модель:** Whisper large-v3-turbo (INT8, ~1.5GB)
**Формат:** Принимает любой аудиоформат (конвертирует в WAV 16kHz mono)

### Ключевые особенности
- Работает на CPU (включая Apple Silicon)
- Производительность ~10-15x realtime
- Разбиение на предложения по пунктуации
- Коррекция таймингов первого слова (см. документацию)

### API

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/health` | GET | `{"status": "healthy", "model_loaded": true}` |
| `/transcribe` | POST | `{file_url, recording_id}` → `{text, segments, duration}` |
| `/transcribe/batch` | POST | Асинхронная batch-транскрибация |

### Проверка работоспособности
```bash
curl http://localhost:8001/health
```

## Админ-панель (/void)

Скрытая админ-панель для управления комнатами и встречами.

### Доступ
- URL: `/void` (не связана с основным интерфейсом)
- Защита: статический ключ `ADMIN_SECRET_KEY` из `.env.local`
- Авторизация через форму при входе

### Функции
- Просмотр статистики (онлайн, комнаты, встречи, записи)
- Управление комнатами (просмотр, копирование ссылки, удаление)
- Мониторинг встреч (статус, участники, длительность)

### API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/void/auth` | POST | Проверка ключа доступа |
| `/api/void/stats` | GET | Общая статистика |
| `/api/void/rooms` | GET | Список комнат |
| `/api/void/rooms` | DELETE | Удаление комнаты |
| `/api/void/meetings` | GET | Список встреч |

Все API endpoints (кроме auth) требуют заголовок `Authorization: Bearer <ADMIN_SECRET_KEY>`
