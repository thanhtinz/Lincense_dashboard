#!/bin/bash
# =============================================================================
# License Platform — Monitoring & Health Check Tools
# =============================================================================

# ── 1. Quick health check ─────────────────────────────────────────────────────
check_health() {
  local BASE="${1:-http://localhost:3001}"
  echo "Checking $BASE/health..."
  curl -sf "$BASE/health" | python3 -m json.tool 2>/dev/null || curl -sf "$BASE/health"
  echo ""
}

# ── 2. Load test — verify endpoint (requires: wrk or ab) ─────────────────────
load_test_verify() {
  local BASE="${1:-http://localhost:3001}"
  local DURATION="${2:-30}"

  echo "Load testing POST /api/v1/verify for ${DURATION}s..."
  echo "Target: 1000 req/min = ~17 req/s"
  echo ""

  # Using `ab` (Apache Benchmark — usually pre-installed)
  if command -v ab >/dev/null 2>&1; then
    ab -n 500 -c 10 -T "application/json" \
      -p /tmp/verify_payload.json \
      "$BASE/api/v1/verify"
  elif command -v wrk >/dev/null 2>&1; then
    # wrk needs a lua script for POST
    cat > /tmp/verify.lua << 'LUA'
wrk.method = "POST"
wrk.body = '{"key":"LIC-SVP-LOADTEST-1234-XX","product_id":"SHOPVPS","version":"2.0.0","domain":"test.com"}'
wrk.headers["Content-Type"] = "application/json"
LUA
    wrk -t4 -c20 -d${DURATION}s -s /tmp/verify.lua "$BASE/api/v1/verify"
  else
    echo "Install 'ab' (apache2-utils) or 'wrk' to run load tests"
    echo "  Ubuntu: apt install apache2-utils"
  fi
}

# Create sample payload for ab
cat > /tmp/verify_payload.json << 'EOF'
{"key":"LIC-SVP-LOADTEST-1234-XX","product_id":"SHOPVPS","version":"2.0.0","domain":"test.com"}
EOF

# ── 3. Uptime Robot setup instructions ───────────────────────────────────────
print_monitoring_setup() {
  cat << 'EOF'

╔══════════════════════════════════════════════════════════╗
║   Monitoring Setup — Uptime Robot / Better Uptime        ║
╚══════════════════════════════════════════════════════════╝

1. Sign up at https://uptimerobot.com (free tier: 50 monitors, 5min checks)

2. Create monitors:

   Monitor 1 — API Health
     Type: HTTP(s)
     URL:  https://license.yourdomain.com/health
     Interval: 5 minutes
     Alert: Email + Telegram when down > 1 check

   Monitor 2 — Dashboard
     Type: HTTP(s)
     URL:  https://license.yourdomain.com
     Interval: 5 minutes

3. Set alert contact:
   - Email: your@email.com
   - Telegram: optional (get bot token + chat ID)

4. Alert threshold: "Down for 1 check" = alert immediately
   (products have 24h grace period so act within 1 hour of alert)

5. Webhook alert (optional) — POST to your Telegram/Slack:
   https://api.telegram.org/bot{TOKEN}/sendMessage?chat_id={ID}&text=ALERT+LicenseServer+DOWN

EOF
}

# ── 4. Docker resource monitoring ────────────────────────────────────────────
watch_containers() {
  docker stats lp_api lp_dashboard lp_postgres lp_redis lp_nginx \
    --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
}

# ── 5. Tail logs ──────────────────────────────────────────────────────────────
tail_logs() {
  docker-compose -f "$(dirname "$0")/../docker-compose.prod.yml" logs -f --tail=50 api
}

# ── CLI dispatcher ────────────────────────────────────────────────────────────
case "${1:-}" in
  health)   check_health "${2:-}" ;;
  load)     load_test_verify "${2:-}" "${3:-30}" ;;
  monitor)  print_monitoring_setup ;;
  watch)    watch_containers ;;
  logs)     tail_logs ;;
  *)
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  health [base_url]        Quick health check"
    echo "  load   [base_url] [sec]  Load test /verify endpoint"
    echo "  monitor                  Print monitoring setup instructions"
    echo "  watch                    Live Docker resource stats"
    echo "  logs                     Tail API logs"
    ;;
esac
