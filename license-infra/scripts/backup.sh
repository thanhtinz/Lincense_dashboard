#!/bin/sh
# =============================================================================
# License Platform — Daily DB Backup
# Runs inside the backup container. Called by docker-compose entrypoint.
# =============================================================================

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/backups/license_platform_${TIMESTAMP}.sql.gz"
KEEP_DAYS=7

echo "[backup] Starting backup at $(date)"

# ── Dump PostgreSQL ───────────────────────────────────────────────────────────
pg_dump \
  -h postgres \
  -U license_user \
  -d license_platform \
  --no-password \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip -9 > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[backup] OK  Dump complete: $BACKUP_FILE ($SIZE)"

# ── Upload to S3 / Cloudflare R2 ──────────────────────────────────────────────
if [ -n "$S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
  S3_KEY="backups/license_platform_${TIMESTAMP}.sql.gz"

  # Cloudflare R2 example: set endpoint via env
  ENDPOINT_FLAG=""
  if [ -n "$R2_ENDPOINT" ]; then
    ENDPOINT_FLAG="--endpoint-url ${R2_ENDPOINT}"
  fi

  aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/${S3_KEY}" \
    $ENDPOINT_FLAG \
    --storage-class STANDARD_IA \
    --quiet

  echo "[backup] OK  Uploaded to s3://${S3_BUCKET}/${S3_KEY}"
else
  echo "[backup] WARN S3 not configured — backup stored locally only"
fi

# ── Cleanup old local backups (keep last N days) ──────────────────────────────
find /backups -name "*.sql.gz" -mtime +${KEEP_DAYS} -delete
REMAINING=$(ls /backups/*.sql.gz 2>/dev/null | wc -l)
echo "[backup] Local backups retained: $REMAINING"

# ── Health check ping (optional — Uptime Robot / Better Uptime) ───────────────
if [ -n "$BACKUP_HEALTH_URL" ]; then
  curl -fsS "$BACKUP_HEALTH_URL" > /dev/null 2>&1 || true
fi

echo "[backup] Done at $(date)"
