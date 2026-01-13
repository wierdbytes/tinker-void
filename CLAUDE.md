# CLAUDE.md - Контекст проекта TinkerDesk

## Описание проекта

TinkerDesk — веб-приложение для голосовых встреч команды (аналог Zoom) с функциями:
- Голосовая связь через LiveKit (self-hosted)
- Запись каждого участника отдельно
- Транскрибация речи в текст (Parakeet/NVIDIA NeMo)
- Суммаризация встреч (Claude API)
- Диалог с именами участников

## Технологический стек

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes
- **База данных:** PostgreSQL + Prisma ORM
- **Голосовая связь:** LiveKit (self-hosted, v1.9.8)
- **Транскрибация:** Parakeet V3 (Rust/ONNX, работает на CPU включая Apple M1)
- **Суммаризация:** Claude API (Anthropic)
- **Хранение файлов:** MinIO (S3-совместимое)
- **Контейнеризация:** Docker Compose

## Структура проекта

```
tinkerdesk/
├── app/                          # Next.js приложение
│   ├── src/
│   │   ├── app/                  # Pages и API routes
│   │   │   ├── page.tsx          # Главная (лобби)
│   │   │   ├── room/[roomId]/    # Страница комнаты
│   │   │   ├── meetings/         # История встреч
│   │   │   └── api/              # API endpoints
│   │   ├── components/           # React компоненты
│   │   │   ├── room/             # Компоненты комнаты
│   │   │   └── ui/               # shadcn/ui
│   │   └── lib/                  # Утилиты и клиенты
│   ├── prisma/schema.prisma      # Схема БД
│   └── .env.local                # Переменные окружения
├── services/
│   ├── livekit/                  # Конфигурация LiveKit
│   │   ├── livekit.yaml
│   │   └── egress.yaml
│   ├── transcriber/              # [Legacy] Python/FastAPI (требует GPU)
│   └── transcriber-rs/           # Сервис транскрибации (Rust/ONNX)
│       ├── Cargo.toml
│       ├── Dockerfile
│       └── src/
│           ├── main.rs           # Axum HTTP сервер
│           ├── config.rs         # Конфигурация
│           ├── transcriber.rs    # Интеграция parakeet-rs
│           ├── handlers.rs       # HTTP handlers
│           ├── storage.rs        # MinIO клиент
│           └── queue.rs          # Redis очередь
├── docker-compose.yml            # Оркестрация сервисов
├── scripts/setup.sh              # Скрипт настройки
└── PLAN.md                       # Детальный план проекта
```

## Команды

### Первоначальная настройка
```bash
./scripts/setup.sh
```

### Запуск инфраструктуры (Docker)
```bash
docker compose up -d postgres redis minio minio-setup livekit livekit-egress
```

### Запуск Next.js dev-сервера
```bash
cd app && npm run dev
```

### Prisma команды
```bash
cd app
npm run db:generate    # Генерация клиента
npm run db:push        # Применение схемы
npm run db:studio      # GUI для БД
```

### Логи Docker
```bash
docker compose logs -f livekit
docker compose logs -f postgres
```

### Перезапуск LiveKit
```bash
docker compose restart livekit
```

## Переменные окружения

Файл `app/.env.local`:
```env
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://tinkerdesk:tinkerdesk_secret@localhost:5432/tinkerdesk
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret123456789012345678901234567890
ANTHROPIC_API_KEY=<требуется добавить>
```

## Известные проблемы

### 1. RED кодек в Chrome (критично)
**Проблема:** LiveKit v1.9.8 падает с panic при подключении второго участника из Chrome из-за бага с RED аудио кодеком.

**Решение:** Отключить RED кодек в `VideoRoom.tsx`:
```typescript
const room = new Room({
  audioCaptureDefaults: { red: false },
})
```

### 2. Webhook URL для локальной разработки
**Проблема:** LiveKit контейнер не может достучаться до `http://app:3000`.

**Решение:** В `services/livekit/livekit.yaml` используется:
```yaml
webhook:
  urls:
    - http://host.docker.internal:3000/api/livekit/webhook
```

### 3. Prisma не находит DATABASE_URL
**Проблема:** Prisma читает `.env`, а не `.env.local`.

**Решение:** Скрипт `setup.sh` создаёт `app/.env` из `app/.env.local`.

## API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/rooms` | POST | Создание комнаты |
| `/api/livekit/token` | POST | Генерация токена LiveKit |
| `/api/livekit/webhook` | POST | Обработка событий LiveKit |
| `/api/meetings` | GET | Список встреч |
| `/api/meetings/[id]` | GET | Детали встречи |
| `/api/transcribe` | POST | Запуск транскрибации |
| `/api/summarize` | POST | Запуск суммаризации |

## Схема базы данных

- **Room** — комнаты для встреч
- **Meeting** — встречи (статус: IN_PROGRESS, PROCESSING, COMPLETED, FAILED)
- **Participant** — участники встречи
- **Utterance** — фразы транскрипта с временными метками
- **Recording** — записи аудио участников

## Порты

| Порт | Сервис |
|------|--------|
| 3000 | Next.js |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 7880 | LiveKit HTTP/WebSocket |
| 7881 | LiveKit RTC (TCP) |
| 7882 | LiveKit RTC (UDP) |
| 8001 | Transcriber (Parakeet) |
| 9000 | MinIO API |
| 9001 | MinIO Console |

## Рекомендации

1. Запустить `npm audit fix` в `app/` для устранения уязвимостей
2. Обновить Next.js при возможности (предупреждение безопасности в 14.2.21)

## Сервис транскрибации (transcriber-rs)

**Технологии:** Rust + parakeet-rs + ONNX Runtime
**Модель:** Parakeet TDT 0.6B V3 INT8 (25 европейских языков, включая русский)
**Источник модели:** https://blob.handy.computer/parakeet-v3-int8.tar.gz

### Преимущества новой реализации
- Работает на CPU (включая Apple M1/M2/M3)
- Не требует NVIDIA GPU
- Docker образ ~800MB (вместо ~15GB с NeMo)
- Производительность ~20-30x realtime на Apple Silicon

### API транскрибатора

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/health` | GET | Статус сервиса и загрузки модели |
| `/transcribe` | POST | Транскрибация одного файла |
| `/transcribe/batch` | POST | Пакетная транскрибация |
| `/job/{job_id}` | GET | Статус batch job |

### Запуск
```bash
docker compose up transcriber -d
curl http://localhost:8001/health
```
