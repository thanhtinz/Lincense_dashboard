#!/bin/bash
# =============================================================================
# License Platform — First-Time Deployment Script
# Run this on your VPS after cloning the repo.
# =============================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   License Platform — Production Deploy   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
[ -z "$DOMAIN" ] && error "Usage: ./deploy.sh <domain> <email>\n  Example: ./deploy.sh license.yourdomain.com admin@yourdomain.com"
[ -z "$EMAIL" ]  && error "Email required for Let's Encrypt certificates"

command -v docker       >/dev/null 2>&1 || error "Docker not installed. Install: https://docs.docker.com/engine/install/"
command -v docker-compose >/dev/null 2>&1 || { command -v docker >/dev/null && docker compose version >/dev/null 2>&1; } || error "docker-compose not found"

info "Domain: $DOMAIN"
info "Email:  $EMAIL"

# ── Check .env exists ─────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  warn ".env not found — creating from .env.example"
  cp .env.example .env
  warn "WARN  Edit .env with your values, then re-run this script"
  exit 1
fi

# ── Set domain in nginx config ────────────────────────────────────────────────
info "Configuring nginx for $DOMAIN..."
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" nginx/conf.d/license-platform.conf
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" .env 2>/dev/null || true
success "Nginx configured"

# ── SSL certificate (Let's Encrypt) ──────────────────────────────────────────
info "Obtaining SSL certificate for $DOMAIN..."

# Temporarily start nginx with HTTP-only config for ACME challenge
cat > /tmp/nginx-init.conf << EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
EOF

docker run --rm -d --name nginx_init \
  -p 80:80 \
  -v /tmp/nginx-init.conf:/etc/nginx/conf.d/default.conf:ro \
  -v lp_certbot_www:/var/www/certbot \
  nginx:1.25-alpine >/dev/null 2>&1

sleep 2

docker run --rm \
  -v lp_certbot_certs:/etc/letsencrypt \
  -v lp_certbot_www:/var/www/certbot \
  certbot/certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos --no-eff-email \
  -d "$DOMAIN" || {
    docker stop nginx_init >/dev/null 2>&1 || true
    error "SSL certificate failed. Check domain DNS points to this server."
  }

docker stop nginx_init >/dev/null 2>&1 || true
success "SSL certificate obtained"

# ── Build and start services ──────────────────────────────────────────────────
info "Building Docker images (this may take a few minutes)..."
docker-compose -f docker-compose.prod.yml build --no-cache
success "Images built"

info "Starting services..."
docker-compose -f docker-compose.prod.yml up -d
success "Services started"

# ── Wait for health ────────────────────────────────────────────────────────────
info "Waiting for API to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    success "API is healthy"
    break
  fi
  [ "$i" -eq 30 ] && error "API failed to start. Check: docker-compose -f docker-compose.prod.yml logs api"
  sleep 2
done

# ── Firewall ──────────────────────────────────────────────────────────────────
if command -v ufw >/dev/null 2>&1; then
  info "Configuring UFW firewall..."
  ufw allow 80/tcp  >/dev/null 2>&1
  ufw allow 443/tcp >/dev/null 2>&1
  ufw allow 22/tcp  >/dev/null 2>&1
  ufw --force enable >/dev/null 2>&1
  success "Firewall configured (80, 443, 22)"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   OK  Deployment Complete!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Dashboard: ${CYAN}https://$DOMAIN${NC}"
echo -e "  API:       ${CYAN}https://$DOMAIN/api/v1${NC}"
echo -e "  Health:    ${CYAN}https://$DOMAIN/health${NC}"
echo ""
echo -e "  Admin login:  ${YELLOW}$(grep ADMIN_EMAIL .env | cut -d= -f2)${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "     docker-compose -f docker-compose.prod.yml logs -f api"
echo -e "     docker-compose -f docker-compose.prod.yml ps"
echo -e "     docker-compose -f docker-compose.prod.yml restart api"
echo ""
