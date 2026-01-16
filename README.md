# TinkerVoid

A simple way to organize team calls without the hassle.

## Features

**No account required** — just create a room and share the link.

- **Automatic recording** — every participant's audio is recorded separately
- **Automatic transcription** — speech-to-text with speaker names and timestamps
- **Meeting playback** — listen to recordings with individual volume control per participant
- **Screen sharing** — present your screen during calls

## Quick Start

### Requirements

- Docker & Docker Compose
- OpenSSL (for password generation)

### Deploy to your server

```bash
# Clone repository
git clone https://github.com/wierdbytes/tinker-void.git
cd tinker-void

# Initialize configuration (generates secure passwords)
./scripts/deploy.sh --init

# Edit .env.prod with your domain
nano .env.prod

# Start all services
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

For detailed deployment options and Traefik integration, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

MIT
