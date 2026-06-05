#!/bin/bash
# =============================================================================
# License Platform — Operations Runbook
# Common maintenance tasks and incident response.
# =============================================================================

COMPOSE="docker-compose -f $(dirname "$0")/../docker-compose.prod.yml"

# ── Service management ────────────────────────────────────────────────────────
start()   { $COMPOSE up -d; }
stop()    { $COMPOSE down; }
restart() { $COMPOSE restart "${1:-api}"; }
status()  { $COMPOSE ps; }
logs()    { $COMPOSE logs -f --tail=100 "${1:-api}"; }

# ── DB operations ─────────────────────────────────────────────────────────────
db_shell() {
  docker exec -it lp_postgres psql -U license_user -d license_platform
}

db_backup_now() {
  docker exec lp_backup sh /backup.sh
  echo "Backup triggered. Check: docker logs lp_backup"
}

db_restore() {
  local FILE="${1:-}"
  [ -z "$FILE" ] && echo "Usage: $0 db_restore <backup.sql.gz>" && exit 1
  echo "WARN This will OVERWRITE the production database!"
  read -rp "Type 'yes' to confirm: " CONFIRM
  [ "$CONFIRM" != "yes" ] && echo "Aborted" && exit 0

  gunzip -c "$FILE" | docker exec -i lp_postgres psql \
    -U license_user -d license_platform
  echo "Restore complete. Restart API: $0 restart api"
}

# ── Redis operations ──────────────────────────────────────────────────────────
redis_cli() {
  docker exec -it lp_redis redis-cli -a "${REDIS_PASSWORD:-}" "$@"
}

redis_flush_ban() {
  echo "Flushing all IP bans..."
  docker exec lp_redis redis-cli -a "${REDIS_PASSWORD:-}" --scan --pattern "ban:*" \
    | xargs -r docker exec lp_redis redis-cli -a "${REDIS_PASSWORD:-}" del
  echo "Done"
}

redis_flush_rate_limits() {
  echo "Flushing rate limit counters..."
  docker exec lp_redis redis-cli -a "${REDIS_PASSWORD:-}" --scan --pattern "rl:*" \
    | xargs -r docker exec lp_redis redis-cli -a "${REDIS_PASSWORD:-}" del
  echo "Done"
}

# ── SSL certificate ───────────────────────────────────────────────────────────
ssl_renew() {
  echo "Forcing SSL certificate renewal..."
  docker exec lp_certbot certbot renew --force-renewal
  $COMPOSE exec nginx nginx -s reload
  echo "Done"
}

ssl_check() {
  local DOMAIN="${1:-$(grep DOMAIN ../.env | cut -d= -f2)}"
  echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
    | openssl x509 -noout -dates
}

# ── Rotation & updates ────────────────────────────────────────────────────────
rotate_jwt_secret() {
  echo "WARN Rotating JWT secret will invalidate ALL admin sessions!"
  read -rp "Type 'yes' to confirm: " CONFIRM
  [ "$CONFIRM" != "yes" ] && echo "Aborted" && exit 0

  NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" ../.env
  $COMPOSE up -d api
  echo "JWT secret rotated. All admins must log in again."
}

pull_and_redeploy() {
  echo "Pulling latest images and redeploying (zero-downtime)..."
  $COMPOSE build --no-cache api dashboard
  $COMPOSE up -d --no-deps api
  sleep 5
  $COMPOSE up -d --no-deps dashboard
  echo "Redeployed. Check: $0 status"
}

# ── CLI dispatcher ────────────────────────────────────────────────────────────
case "${1:-}" in
  start)              start ;;
  stop)               stop ;;
  restart)            restart "${2:-api}" ;;
  status)             status ;;
  logs)               logs "${2:-api}" ;;
  db-shell)           db_shell ;;
  db-backup)          db_backup_now ;;
  db-restore)         db_restore "${2:-}" ;;
  redis-cli)          shift; redis_cli "$@" ;;
  flush-bans)         redis_flush_ban ;;
  flush-rate-limits)  redis_flush_rate_limits ;;
  ssl-renew)          ssl_renew ;;
  ssl-check)          ssl_check "${2:-}" ;;
  rotate-jwt)         rotate_jwt_secret ;;
  redeploy)           pull_and_redeploy ;;
  *)
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Service:"
    echo "  start / stop / status"
    echo "  restart [api|dashboard|nginx]"
    echo "  logs [api|dashboard|nginx]"
    echo "  redeploy                    Rebuild + rolling restart"
    echo ""
    echo "Database:"
    echo "  db-shell                    PostgreSQL interactive shell"
    echo "  db-backup                   Trigger backup now"
    echo "  db-restore <file.sql.gz>    Restore from backup"
    echo ""
    echo "Redis:"
    echo "  redis-cli [args]            Redis CLI"
    echo "  flush-bans                  Remove all IP bans"
    echo "  flush-rate-limits           Reset rate limit counters"
    echo ""
    echo "SSL:"
    echo "  ssl-renew                   Force certificate renewal"
    echo "  ssl-check [domain]          Check certificate expiry"
    echo ""
    echo "Security:"
    echo "  rotate-jwt                  Rotate JWT secret"
    ;;
esac
