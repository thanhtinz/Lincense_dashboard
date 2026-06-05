# License Platform — Production Infrastructure

## Prerequisites

- VPS: Ubuntu 22.04+, 2 CPU, 2GB RAM minimum (Hetzner CX21 / DigitalOcean Droplet)
- Domain pointed to server IP (A record)
- Docker + Docker Compose installed

```bash
# Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin apache2-utils
```

---

## Directory Layout

```
license-infra/
├── docker-compose.prod.yml   # Full production stack
├── .env.example              # All environment variables
├── nginx/
│   ├── nginx.conf            # Main nginx config
│   └── conf.d/
│       └── license-platform.conf  # Virtual host (edit YOUR_DOMAIN)
└── scripts/
    ├── deploy.sh             # First-time deployment
    ├── backup.sh             # Daily DB backup (runs in container)
    ├── monitor.sh            # Health check + load test tools
    └── ops.sh                # Day-to-day operations runbook
```

Place this `license-infra/` folder next to `license-platform/` and `license-dashboard/` on your server.

---

## First Deployment

```bash
# 1. Generate secrets (run from license-platform root)
node scripts/setup.js

# 2. Copy generated .env values into license-infra/.env
cp license-infra/.env.example license-infra/.env
# Then copy JWT_SECRET, RSA keys, AES_MASTER_KEY from license-platform/.env

# 3. Deploy (obtains SSL cert + starts all services)
cd license-infra
chmod +x scripts/*.sh
./scripts/deploy.sh license.yourdomain.com admin@yourdomain.com
```

---

## Services

| Container | Internal Port | External | Description |
|-----------|--------------|----------|-------------|
| `lp_nginx` | 80, 443 | ✅ | Reverse proxy + SSL termination |
| `lp_api` | 3001 | ❌ | Express API server |
| `lp_dashboard` | 3000 | ❌ | Next.js admin UI |
| `lp_postgres` | 5432 | ❌ | Database (internal only) |
| `lp_redis` | 6379 | ❌ | Cache + rate limiting (internal only) |
| `lp_certbot` | — | ❌ | Auto-renews SSL every 12h |
| `lp_backup` | — | ❌ | Daily DB backup at 02:00 |

---

## Nginx Request Flow

```
Internet → :443 (HTTPS)
  → nginx (SSL termination + rate limiting)
    → /api/v1/verify   → lp_api:3001  [10 req/min/IP + burst 5]
    → /api/v1/auth/*   → lp_api:3001  [5 req/min/IP for login]
    → /api/*           → lp_api:3001  [60 req/min/IP]
    → /health          → lp_api:3001  [no rate limit]
    → /                → lp_dashboard:3000
```

---

## Monitoring

```bash
# Set up Uptime Robot monitors
./scripts/monitor.sh monitor

# Live container stats
./scripts/monitor.sh watch

# Health check
./scripts/monitor.sh health https://license.yourdomain.com

# Load test (verify endpoint)
./scripts/monitor.sh load https://license.yourdomain.com 30
```

**Recommended Uptime Robot config:**
- Monitor `https://license.yourdomain.com/health` every 5 minutes
- Alert threshold: 1 failed check = immediate alert
- Why: products have 24h grace period — you have ~23h to fix before customer impact

---

## Daily Operations

```bash
# View all service status
./scripts/ops.sh status

# Tail API logs
./scripts/ops.sh logs api

# Restart API after config change
./scripts/ops.sh restart api

# Trigger DB backup immediately
./scripts/ops.sh db-backup

# Unban an IP
./scripts/ops.sh flush-bans

# Roll out new version
./scripts/ops.sh redeploy
```

---

## Backup & Recovery

Backups run automatically at **02:00 daily** inside the `lp_backup` container.

**Local backups:** stored in Docker volume `lp_backup_data` (7 days retention)

**S3/R2 offsite:** set `BACKUP_S3_BUCKET`, `BACKUP_AWS_KEY`, `BACKUP_AWS_SECRET` in `.env`

**Restore:**
```bash
# Download backup from S3 first if needed
./scripts/ops.sh db-restore ./license_platform_20260601_020000.sql.gz
```

---

## Security Checklist

- [ ] `.env` file has `chmod 600` permissions
- [ ] All `CHANGE_ME_` values replaced in `.env`
- [ ] UFW firewall: only 80, 443, 22 open
- [ ] SSH key auth only (disable password auth)
- [ ] Admin password changed after first login
- [ ] Uptime monitor alert set up
- [ ] S3 backup configured and tested

---

## Scaling (when needed)

For high verify traffic (>1000 req/min):

1. Increase `worker_processes` in `nginx.conf` (match CPU cores)
2. Add Redis cluster for rate limiting
3. Run multiple `api` replicas behind nginx upstream:

```nginx
upstream api_backend {
    server api_1:3001;
    server api_2:3001;
    keepalive 32;
}
```

PostgreSQL read replicas for verify log queries (Phase 5+).
