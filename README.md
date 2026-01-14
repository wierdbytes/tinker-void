# TinkerVoid

## Production Deployment

### Requirements

- Docker & Docker Compose
- OpenSSL (for password generation)

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/wierdbytes/tinker-void.git tinker-void
cd tinker-void

# 2. Initialize configuration (generates secure passwords)
./scripts/deploy.sh --init

# 3. Start services
./scripts/deploy.sh --start
```

### Commands

| Command | Description |
|---------|-------------|
| `./scripts/deploy.sh` | Interactive mode |
| `./scripts/deploy.sh --init` | Initialize config, generate passwords |
| `./scripts/deploy.sh --start` | Start all services |
| `./scripts/deploy.sh --stop` | Stop all services |
| `./scripts/deploy.sh --restart` | Restart all services |
| `./scripts/deploy.sh --logs` | View all logs |
| `./scripts/deploy.sh --logs app` | View specific service logs |
| `./scripts/deploy.sh --status` | Check service status |
| `./scripts/deploy.sh --update` | Pull latest code and restart |
| `./scripts/deploy.sh --migrate` | Run database migrations |
| `./scripts/deploy.sh --traefik-on` | Enable Traefik reverse proxy |
| `./scripts/deploy.sh --traefik-off` | Disable Traefik reverse proxy |

### Configuration

After running `--init`, edit `.env.prod` to adjust:

```bash
# Domain
DOMAIN=example.com
NEXT_PUBLIC_LIVEKIT_URL=wss://example.com:7880
NEXT_PUBLIC_APP_URL=https://example.com

# Transcriber settings
WHISPER_MODEL_SIZE=large-v3
TRANSCRIBER_CPU_THREADS=4
TRANSCRIBER_LANGUAGE=ru
```

### Traefik Integration

To expose the app via Traefik reverse proxy:

```bash
# Enable during init (interactive prompt)
./scripts/deploy.sh --init

# Or enable for existing config
./scripts/deploy.sh --traefik-on
./scripts/deploy.sh --restart
```

Configuration in `.env.prod`:

```bash
USE_TRAEFIK=true
TRAEFIK_HOST=tinkervoid.example.com
TRAEFIK_LIVEKIT_HOST=livekit.example.com
TRAEFIK_CERTRESOLVER=le
```

Requirements:
- External Docker network `traefik` must exist
- LiveKit ports 7881 (TCP) and 7882 (UDP) remain exposed directly (WebRTC)

### Files

| File | Description |
|------|-------------|
| `docker-compose.prod.yml` | Production Docker configuration |
| `docker-compose.traefik.yml` | Traefik override (used when `USE_TRAEFIK=true`) |
| `.env.prod` | Production environment (generated, gitignored) |
| `.env.prod.example` | Environment template |
| `scripts/deploy.sh` | Deployment script |
