#!/bin/bash

set -e

echo "=== TinkerDesk Setup ==="
echo ""

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo "Error: Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please edit .env and add your ANTHROPIC_API_KEY"
fi

# Create app/.env.local if it doesn't exist
if [ ! -f "app/.env.local" ]; then
    echo "Creating app/.env.local from example..."
    cp app/.env.local.example app/.env.local
    echo "Please edit app/.env.local and add your ANTHROPIC_API_KEY"
fi

# Create app/.env for Prisma (Prisma reads .env, not .env.local)
if [ ! -f "app/.env" ]; then
    echo "Creating app/.env for Prisma..."
    cp app/.env.local app/.env
fi

echo ""
echo "Starting infrastructure services (PostgreSQL, Redis, MinIO, LiveKit)..."
docker compose up -d postgres redis minio minio-setup livekit livekit-egress

echo ""
echo "Waiting for services to be ready..."
sleep 10

echo ""
echo "Installing Node.js dependencies..."
cd app
npm install

echo ""
echo "Generating Prisma client..."
npm run db:generate

echo ""
echo "Running database migrations..."
npm run db:push

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "To start the development server:"
echo "  cd app && npm run dev"
echo ""
echo "To start the transcriber service (requires NVIDIA GPU):"
echo "  docker compose up transcriber"
echo ""
echo "Access the app at: http://localhost:3000"
echo "MinIO Console: http://localhost:9001 (minioadmin/minioadmin123)"
echo ""
