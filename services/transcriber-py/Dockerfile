# Stage 1: Download and cache models (Whisper + Silero VAD)
FROM python:3.11-slim AS model-downloader

# Install dependencies for model download (CPU-only PyTorch)
RUN pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    faster-whisper torch torchaudio

# Pre-download the large-v3 Whisper model (INT8 quantized)
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3', device='cpu', compute_type='int8', download_root='/models')"

# Pre-download Silero VAD model
RUN python -c "import torch; torch.hub.load('snakers4/silero-vad', 'silero_vad', trust_repo=True)"

# Stage 2: Build Python dependencies
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies as wheels
# Use CPU-only PyTorch to reduce image size (~200MB vs ~2GB)
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.txt

# Stage 3: Runtime
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install Python packages from pre-built wheels
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    /wheels/* \
    && rm -rf /wheels

# Copy pre-downloaded models from first stage
COPY --from=model-downloader /models /app/models
COPY --from=model-downloader /root/.cache/torch /root/.cache/torch

# Copy application code
COPY app/ /app/app/

# Environment variables
ENV MODEL_PATH=/app/models
ENV HOST=0.0.0.0
ENV PORT=8000
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8000/health'); exit(0 if r.status_code == 200 else 1)"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
