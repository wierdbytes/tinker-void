# Stage 1: Download model
FROM alpine:latest AS model-downloader

RUN apk add --no-cache wget tar

WORKDIR /models

# Download Parakeet V3 INT8 model from Handy
RUN wget -q https://blob.handy.computer/parakeet-v3-int8.tar.gz && \
    tar -xzf parakeet-v3-int8.tar.gz && \
    rm parakeet-v3-int8.tar.gz

# Stage 2: Build Rust application
# Use Ubuntu 24.04 for glibc 2.39 compatibility with pre-built ONNX Runtime
FROM ubuntu:24.04 AS builder

WORKDIR /app

# Install Rust and build dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    libonig-dev \
    && rm -rf /var/lib/apt/lists/* \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable

ENV PATH="/root/.cargo/bin:${PATH}"

# Copy manifests
COPY Cargo.toml ./

# Create dummy src for dependency caching
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies only
RUN cargo build --release && rm -rf src target/release/deps/transcriber*

# Copy actual source
COPY src ./src

# Build application
RUN cargo build --release

# Stage 3: Runtime
# Use Ubuntu 24.04 to match the build environment glibc version
FROM ubuntu:24.04

# Install runtime dependencies (including ffmpeg for audio conversion)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3t64 \
    libonig5 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary
COPY --from=builder /app/target/release/transcriber-rs /app/transcriber

# Copy model (Parakeet V3 INT8 from Handy)
COPY --from=model-downloader /models/parakeet-tdt-0.6b-v3-int8 /app/models/parakeet-v3

# Environment
ENV MODEL_PATH=/app/models/parakeet-v3
ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

CMD ["/app/transcriber"]
