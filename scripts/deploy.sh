#!/bin/bash

# =============================================================================
# TinkerVoid Production Deployment Script
# =============================================================================
# Usage:
#   ./scripts/deploy.sh              - Interactive setup and deploy
#   ./scripts/deploy.sh --init       - Initialize config only (generate passwords)
#   ./scripts/deploy.sh --start      - Start all services
#   ./scripts/deploy.sh --stop       - Stop all services
#   ./scripts/deploy.sh --restart    - Restart all services
#   ./scripts/deploy.sh --logs       - View logs
#   ./scripts/deploy.sh --status     - Check status
#   ./scripts/deploy.sh --update     - Pull latest and restart
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Files
ENV_FILE="$PROJECT_DIR/.env.prod"
ENV_EXAMPLE="$PROJECT_DIR/.env.prod.example"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
LIVEKIT_TEMPLATE="$PROJECT_DIR/services/livekit/livekit.prod.yaml.template"
LIVEKIT_CONFIG="$PROJECT_DIR/services/livekit/livekit.prod.yaml"
EGRESS_TEMPLATE="$PROJECT_DIR/services/livekit/egress.prod.yaml.template"
EGRESS_CONFIG="$PROJECT_DIR/services/livekit/egress.prod.yaml"

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Generate a random password
generate_password() {
    local length=${1:-32}
    openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c "$length"
}

# Generate a random API key (alphanumeric, lowercase)
generate_api_key() {
    openssl rand -base64 16 | tr -dc 'a-z0-9' | head -c 12
}

# Check if command exists
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# Load environment variables
load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
        return 0
    fi
    return 1
}

# -----------------------------------------------------------------------------
# Configuration Functions
# -----------------------------------------------------------------------------

init_config() {
    log_info "Initializing production configuration..."

    # Check requirements
    check_command docker
    check_command openssl

    if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    # Create .env.prod if it doesn't exist
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "$ENV_EXAMPLE" ]; then
            cp "$ENV_EXAMPLE" "$ENV_FILE"
            log_success "Created $ENV_FILE from template"
        else
            log_error "Template file $ENV_EXAMPLE not found"
            exit 1
        fi
    fi

    # Ask for domain
    echo ""
    read -p "Enter your domain (e.g., tinkervoid.example.com): " DOMAIN
    if [ -z "$DOMAIN" ]; then
        log_error "Domain is required"
        exit 1
    fi

    # Generate secure passwords
    log_info "Generating secure passwords..."
    POSTGRES_PASSWORD=$(generate_password 32)
    MINIO_PASSWORD=$(generate_password 32)
    LIVEKIT_API_KEY=$(generate_api_key)
    LIVEKIT_API_SECRET=$(generate_password 40)
    LIVEKIT_WEBHOOK_SECRET="whsec_$(generate_password 24)"

    # Update .env.prod
    log_info "Updating configuration..."

    # Use sed to update values (cross-platform compatible)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        SED_INPLACE="sed -i ''"
    else
        SED_INPLACE="sed -i"
    fi

    $SED_INPLACE "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" "$ENV_FILE"
    $SED_INPLACE "s|^NEXT_PUBLIC_LIVEKIT_URL=.*|NEXT_PUBLIC_LIVEKIT_URL=wss://$DOMAIN:7880|" "$ENV_FILE"
    $SED_INPLACE "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=https://$DOMAIN|" "$ENV_FILE"
    $SED_INPLACE "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" "$ENV_FILE"
    $SED_INPLACE "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$MINIO_PASSWORD|" "$ENV_FILE"
    $SED_INPLACE "s|^LIVEKIT_API_KEY=.*|LIVEKIT_API_KEY=$LIVEKIT_API_KEY|" "$ENV_FILE"
    $SED_INPLACE "s|^LIVEKIT_API_SECRET=.*|LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET|" "$ENV_FILE"
    $SED_INPLACE "s|^LIVEKIT_WEBHOOK_SECRET=.*|LIVEKIT_WEBHOOK_SECRET=$LIVEKIT_WEBHOOK_SECRET|" "$ENV_FILE"

    log_success "Configuration updated in $ENV_FILE"

    # Generate LiveKit configs
    generate_livekit_configs

    echo ""
    log_success "Configuration initialized!"
    echo ""
    echo "Generated credentials (saved in $ENV_FILE):"
    echo "  PostgreSQL password: $POSTGRES_PASSWORD"
    echo "  MinIO password: $MINIO_PASSWORD"
    echo "  LiveKit API key: $LIVEKIT_API_KEY"
    echo "  LiveKit API secret: $LIVEKIT_API_SECRET"
    echo ""
    log_warn "Save these credentials securely! They are stored in $ENV_FILE"
    echo ""
}

generate_livekit_configs() {
    log_info "Generating LiveKit configuration files..."

    # Load environment
    if ! load_env; then
        log_error "Environment file not found. Run --init first."
        exit 1
    fi

    # Generate livekit.prod.yaml
    if [ -f "$LIVEKIT_TEMPLATE" ]; then
        cat "$LIVEKIT_TEMPLATE" | \
            sed "s|{{LIVEKIT_API_KEY}}|$LIVEKIT_API_KEY|g" | \
            sed "s|{{LIVEKIT_API_SECRET}}|$LIVEKIT_API_SECRET|g" \
            > "$LIVEKIT_CONFIG"
        log_success "Generated $LIVEKIT_CONFIG"
    else
        log_error "Template $LIVEKIT_TEMPLATE not found"
        exit 1
    fi

    # Generate egress.prod.yaml
    if [ -f "$EGRESS_TEMPLATE" ]; then
        cat "$EGRESS_TEMPLATE" | \
            sed "s|{{LIVEKIT_API_KEY}}|$LIVEKIT_API_KEY|g" | \
            sed "s|{{LIVEKIT_API_SECRET}}|$LIVEKIT_API_SECRET|g" | \
            sed "s|{{MINIO_ROOT_USER}}|${MINIO_ROOT_USER:-tinkervoid}|g" | \
            sed "s|{{MINIO_ROOT_PASSWORD}}|$MINIO_ROOT_PASSWORD|g" | \
            sed "s|{{MINIO_BUCKET}}|${MINIO_BUCKET:-recordings}|g" \
            > "$EGRESS_CONFIG"
        log_success "Generated $EGRESS_CONFIG"
    else
        log_error "Template $EGRESS_TEMPLATE not found"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Docker Functions
# -----------------------------------------------------------------------------

docker_compose() {
    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
    else
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
    fi
}

start_services() {
    log_info "Starting TinkerVoid services..."

    if [ ! -f "$ENV_FILE" ]; then
        log_error "Configuration not found. Run './scripts/deploy.sh --init' first."
        exit 1
    fi

    # Regenerate LiveKit configs in case env changed
    generate_livekit_configs

    # Build and start
    docker_compose build
    docker_compose up -d

    log_success "Services started!"
    echo ""
    show_status
}

stop_services() {
    log_info "Stopping TinkerVoid services..."
    docker_compose down
    log_success "Services stopped"
}

restart_services() {
    log_info "Restarting TinkerVoid services..."
    stop_services
    start_services
}

show_logs() {
    local service=${1:-}
    if [ -n "$service" ]; then
        docker_compose logs -f "$service"
    else
        docker_compose logs -f
    fi
}

show_status() {
    echo ""
    echo "=== TinkerVoid Service Status ==="
    echo ""
    docker_compose ps
    echo ""

    if load_env; then
        echo "=== Access URLs ==="
        echo ""
        echo "  Application: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
        echo "  LiveKit WS:  ${NEXT_PUBLIC_LIVEKIT_URL:-ws://localhost:7880}"
        echo ""
        echo "=== Security Status ==="
        echo ""
        echo "  PostgreSQL: Internal only (not exposed)"
        echo "  Redis:      Internal only (not exposed)"
        echo "  MinIO:      Internal only (not exposed)"
        echo "  Transcriber: Internal only (not exposed)"
        echo ""
    fi
}

update_services() {
    log_info "Updating TinkerVoid..."

    # Pull latest code (if git repo)
    if [ -d "$PROJECT_DIR/.git" ]; then
        log_info "Pulling latest code..."
        cd "$PROJECT_DIR"
        git pull
    fi

    # Rebuild and restart
    log_info "Rebuilding containers..."
    docker_compose build --no-cache

    restart_services
}

run_migrations() {
    log_info "Running database migrations..."
    docker_compose exec app npx prisma db push
    log_success "Migrations completed"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

show_help() {
    echo "TinkerVoid Production Deployment Script"
    echo ""
    echo "Usage: ./scripts/deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  (no args)    Interactive setup and deploy"
    echo "  --init       Initialize configuration (generate passwords)"
    echo "  --start      Start all services"
    echo "  --stop       Stop all services"
    echo "  --restart    Restart all services"
    echo "  --logs [svc] View logs (optionally for specific service)"
    echo "  --status     Check service status"
    echo "  --update     Pull latest and restart"
    echo "  --migrate    Run database migrations"
    echo "  --help       Show this help"
    echo ""
    echo "Examples:"
    echo "  ./scripts/deploy.sh --init     # First-time setup"
    echo "  ./scripts/deploy.sh --start    # Start services"
    echo "  ./scripts/deploy.sh --logs app # View app logs"
    echo ""
}

main() {
    cd "$PROJECT_DIR"

    case "${1:-}" in
        --init)
            init_config
            ;;
        --start)
            start_services
            ;;
        --stop)
            stop_services
            ;;
        --restart)
            restart_services
            ;;
        --logs)
            show_logs "${2:-}"
            ;;
        --status)
            show_status
            ;;
        --update)
            update_services
            ;;
        --migrate)
            run_migrations
            ;;
        --help|-h)
            show_help
            ;;
        "")
            # Interactive mode
            echo ""
            echo "=== TinkerVoid Production Deployment ==="
            echo ""

            if [ ! -f "$ENV_FILE" ]; then
                log_info "No configuration found. Starting initialization..."
                init_config
                echo ""
                read -p "Start services now? [Y/n]: " START_NOW
                if [[ ! "$START_NOW" =~ ^[Nn]$ ]]; then
                    start_services
                fi
            else
                echo "Configuration exists at $ENV_FILE"
                echo ""
                echo "Options:"
                echo "  1) Start services"
                echo "  2) Stop services"
                echo "  3) Restart services"
                echo "  4) View status"
                echo "  5) View logs"
                echo "  6) Re-initialize configuration"
                echo "  7) Exit"
                echo ""
                read -p "Choose an option [1-7]: " OPTION

                case $OPTION in
                    1) start_services ;;
                    2) stop_services ;;
                    3) restart_services ;;
                    4) show_status ;;
                    5) show_logs ;;
                    6) init_config ;;
                    7) exit 0 ;;
                    *) log_error "Invalid option" ;;
                esac
            fi
            ;;
        *)
            log_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
