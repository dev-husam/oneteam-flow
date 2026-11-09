#!/usr/bin/env bash
# Proves that the newest backup can actually be restored: decrypts it, loads it into a scratch database,
# runs sanity checks and drops the scratch database. Exit code 0 only when every check passes.
# Run weekly (cron / CI schedule). Needs a MySQL account that may create databases named pt_%.
set -euo pipefail

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
MYSQL_DATABASE="${MYSQL_DATABASE:-pt_dev}"
MYSQL_USER="${MYSQL_USER:-pt}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-pt_dev_password}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.yml}"
SCRATCH_DB="pt_restore_check"
MIN_TABLES="${MIN_TABLES:-5}"

latest="$(ls -1t "$BACKUP_DIR"/${MYSQL_DATABASE}-*.sql.gz.enc 2>/dev/null | head -n1 || true)"
[[ -n "$latest" ]] || { echo "FAIL: no backup found in $BACKUP_DIR" >&2; exit 1; }
echo "restoring $latest into $SCRATCH_DB"

mysql_cmd() {
  if [[ -n "${MYSQL_HOST:-}" ]]; then
    MYSQL_PWD="$MYSQL_PASSWORD" mysql -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" "$@"
  else
    docker compose -f "$COMPOSE_FILE" exec -T -e MYSQL_PWD="$MYSQL_PASSWORD" mysql mysql -u "$MYSQL_USER" "$@"
  fi
}

cleanup() { mysql_cmd -e "DROP DATABASE IF EXISTS \`$SCRATCH_DB\`" >/dev/null 2>&1 || true; }
trap cleanup EXIT

mysql_cmd -e "DROP DATABASE IF EXISTS \`$SCRATCH_DB\`; CREATE DATABASE \`$SCRATCH_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$latest" | gunzip | mysql_cmd "$SCRATCH_DB"

tables="$(mysql_cmd -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$SCRATCH_DB'")"
migrations="$(mysql_cmd -N -e "SELECT COUNT(*) FROM \`$SCRATCH_DB\`._prisma_migrations WHERE finished_at IS NOT NULL")"
users="$(mysql_cmd -N -e "SELECT COUNT(*) FROM \`$SCRATCH_DB\`.users")"
echo "tables=$tables migrations=$migrations users=$users"

[[ "$tables" -ge "$MIN_TABLES" ]] || { echo "FAIL: only $tables tables restored" >&2; exit 1; }
[[ "$migrations" -ge 1 ]] || { echo "FAIL: migration history missing" >&2; exit 1; }
echo "OK: backup restored and verified"
