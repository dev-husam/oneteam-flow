#!/usr/bin/env bash
# Prints the SQL that gives the application's RUNTIME database user least-privilege access.
# audit_logs is append-only: the runtime user can SELECT and INSERT but never UPDATE or DELETE it.
# Migrations run with a separate, more privileged user. Re-run after every migration that adds tables.
#
#   MYSQL_DATABASE=pt RUNTIME_USER=pt_app mysql -uroot -p < <(infra/mysql/grant-runtime-user.sh)
set -euo pipefail
DB="${MYSQL_DATABASE:-pt}"
USER_NAME="${RUNTIME_USER:-pt_app}"
HOST="${RUNTIME_HOST:-%}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.yml}"

tables="$(docker compose -f "$COMPOSE_FILE" exec -T mysql mysql -N -uroot -p"${MYSQL_ROOT_PASSWORD:-root_dev_password}" -e "SELECT table_name FROM information_schema.tables WHERE table_schema='${DB}' AND table_name <> '_prisma_migrations'" 2>/dev/null)"
echo "-- create the user first:  CREATE USER IF NOT EXISTS '${USER_NAME}'@'${HOST}' IDENTIFIED BY '<secret>';"
while read -r table; do
  [[ -z "$table" ]] && continue
  if [[ "$table" == "audit_logs" ]]; then
    echo "GRANT SELECT, INSERT ON \`${DB}\`.\`${table}\` TO '${USER_NAME}'@'${HOST}';"
  else
    echo "GRANT SELECT, INSERT, UPDATE, DELETE ON \`${DB}\`.\`${table}\` TO '${USER_NAME}'@'${HOST}';"
  fi
done <<< "$tables"
