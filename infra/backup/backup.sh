#!/usr/bin/env bash
# Encrypted logical backup of the application database.
#
#   Local (compose):  BACKUP_PASSPHRASE=... infra/backup/backup.sh
#   VPS / production: set MYSQL_HOST/PORT/USER/PASSWORD/DATABASE, BACKUP_PASSPHRASE and optionally
#                     S3_BUCKET + S3_ENDPOINT (Cloudflare R2) + AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.
#
# Output: $BACKUP_DIR/<database>-<UTC timestamp>.sql.gz.enc  (AES-256-CBC, PBKDF2). Old files are pruned.
set -euo pipefail

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MYSQL_DATABASE="${MYSQL_DATABASE:-pt_dev}"
MYSQL_USER="${MYSQL_USER:-pt}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-pt_dev_password}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.yml}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/${MYSQL_DATABASE}-${stamp}.sql.gz.enc"

dump() {
  local args=(--single-transaction --no-tablespaces --routines --triggers --events --hex-blob --default-character-set=utf8mb4 --set-gtid-purged=OFF "$MYSQL_DATABASE")
  if [[ -n "${MYSQL_HOST:-}" ]]; then
    MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" "${args[@]}"
  else
    docker compose -f "$COMPOSE_FILE" exec -T -e MYSQL_PWD="$MYSQL_PASSWORD" mysql mysqldump -u "$MYSQL_USER" "${args[@]}"
  fi
}

dump | gzip -9 | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$out"
[[ -s "$out" ]] || { echo "backup is empty" >&2; rm -f "$out"; exit 1; }
echo "backup written: $out ($(wc -c < "$out" | tr -d ' ') bytes)"

if [[ -n "${S3_BUCKET:-}" ]]; then
  aws s3 cp "$out" "s3://${S3_BUCKET}/mysql/$(basename "$out")" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
  echo "uploaded to s3://${S3_BUCKET}/mysql/"
fi

find "$BACKUP_DIR" -name "${MYSQL_DATABASE}-*.sql.gz.enc" -mtime "+${RETENTION_DAYS}" -delete
