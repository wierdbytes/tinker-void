# Transcriber Service (transcriber-py)

Сервис транскрибации речи в текст на базе faster-whisper.

## Технологический стек

- **Python 3.11** + FastAPI
- **faster-whisper** (CTranslate2 backend)
- **Модель:** Whisper large-v3-turbo (INT8, ~1.5GB)
- **ffmpeg** для конвертации аудио
- **Redis** для очереди batch-задач
- **MinIO** для хранения аудиофайлов

## Архитектура

```
POST /transcribe
      ↓
Скачивание OGG из MinIO
      ↓
Конвертация в WAV 16kHz mono (ffmpeg)
      ↓
faster-whisper с VAD фильтрацией
      ↓
Разбиение на предложения по пунктуации
      ↓
Коррекция таймингов (см. ниже)
      ↓
JSON response с segments
```

## API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/health` | GET | `{"status": "healthy", "model_loaded": true}` |
| `/transcribe` | POST | Синхронная транскрибация одного файла |
| `/transcribe/batch` | POST | Асинхронная batch-транскрибация |
| `/job/{job_id}` | GET | Статус batch-задачи |

### POST /transcribe

**Request:**
```json
{
  "file_url": "recordings/room-123/track-abc.ogg",
  "recording_id": "uuid-of-recording"
}
```

**Response:**
```json
{
  "recording_id": "uuid-of-recording",
  "text": "Полный текст транскрипции.",
  "segments": [
    {"start": 0.5, "end": 2.3, "text": "Первое предложение."},
    {"start": 2.5, "end": 4.1, "text": "Второе предложение."}
  ],
  "duration": 45.2
}
```

## Параметры модели

```python
self.model.transcribe(
    audio_path,
    language="ru",
    task="transcribe",
    initial_prompt="IT-терминология...",
    beam_size=3,
    word_timestamps=True,
    vad_filter=True,
    vad_parameters={
        "threshold": 0.4,
        "min_silence_duration_ms": 200,
        "min_speech_duration_ms": 100,
        "speech_pad_ms": 50,
    },
    condition_on_previous_text=True,
    no_speech_threshold=0.6,
)
```

### VAD параметры

| Параметр | Значение | Описание |
|----------|----------|----------|
| `threshold` | 0.4 | Порог детекции речи (0-1) |
| `min_silence_duration_ms` | 200 | Минимальная пауза для разделения |
| `min_speech_duration_ms` | 100 | Минимальная длительность речи |
| `speech_pad_ms` | 50 | Padding вокруг сегментов речи |

### Initial Prompt

Для улучшения распознавания IT-терминов используется prompt:

```
Это разговор о программировании и IT. Часто используются термины:
API, backend, frontend, deploy, commit, pull request, merge, branch,
Docker, Kubernetes, microservices, database, PostgreSQL, Redis,
TypeScript, React, Next.js, component, props, state, hook, async, await,
refactoring, code review, sprint, agile, scrum, endpoint.
```

## Коррекция таймингов

### Проблема

Whisper иногда определяет первое слово предложения значительно раньше реального начала речи. Это приводит к неточным таймстемпам utterance.

### Решение

Алгоритм `_get_sentence_start_time()`:

```python
def _get_sentence_start_time(first_word_start, second_word_start):
    """
    Если разница между первым и вторым словом > 2 секунд:
      → первое слово детектировано слишком рано
      → используем second_word.start - 0.5s

    Если разница <= 2 секунд:
      → тайминги нормальные
      → используем first_word.start
    """
    if second_word_start is None:
        return first_word_start

    gap = second_word_start - first_word_start
    if gap > 2.0:
        return max(0, second_word_start - 0.5)
    return first_word_start
```

| Разница 1-2 слово | Начало предложения |
|-------------------|-------------------|
| > 2 секунд | `second_word.start - 0.5s` |
| <= 2 секунд | `first_word.start` |

### Применение

Коррекция применяется:
1. При разбиении длинных сегментов на предложения (`_split_by_sentences`)
2. При создании коротких сегментов (основной метод `transcribe`)

## Разбиение на предложения

Сегменты длиннее 60 символов разбиваются на отдельные предложения по пунктуации (`.!?`).

```python
if seg.words and len(text) > 60:
    sentence_segments = self._split_by_sentences(seg.words)
```

Это позволяет получить более гранулярные utterance для UI.

## Переменные окружения

| Переменная | Default | Описание |
|------------|---------|----------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8000` | HTTP port |
| `MODEL_SIZE` | `large-v3-turbo` | Whisper модель |
| `MODEL_PATH` | `/app/models` | Путь к моделям |
| `CPU_THREADS` | `4` | Потоки CPU |
| `DEFAULT_LANGUAGE` | `ru` | Язык по умолчанию |
| `MINIO_ENDPOINT` | `minio:9000` | MinIO endpoint |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin123` | MinIO secret key |
| `MINIO_BUCKET` | `recordings` | Bucket для аудио |
| `REDIS_URL` | `redis://redis:6379` | Redis для очереди |

## Docker

### Сборка

```bash
docker compose build transcriber
```

### Запуск

```bash
docker compose up -d transcriber
```

### Multi-stage build

1. **model-downloader** — скачивает Whisper модель
2. **builder** — собирает Python wheels
3. **runtime** — финальный образ (~2GB с моделью)

### Проверка работоспособности

```bash
curl http://localhost:8001/health
```

## Производительность

- **Модель:** large-v3-turbo (INT8 quantized)
- **Скорость:** ~10-15x realtime на CPU
- **RAM:** ~2-3GB при работе
- **Startup:** ~30-60 секунд (загрузка модели)

## Файловая структура

```
services/transcriber-py/
├── Dockerfile
├── requirements.txt
└── app/
    ├── main.py              # FastAPI приложение
    ├── config.py            # Настройки из env
    ├── models/
    │   └── schemas.py       # Pydantic схемы
    └── services/
        ├── transcriber.py   # Основная логика транскрибации
        ├── storage.py       # MinIO клиент
        ├── audio.py         # ffmpeg конвертация
        └── queue.py         # Redis очередь
```
