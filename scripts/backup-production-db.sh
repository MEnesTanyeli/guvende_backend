#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/enes/apps/guvende_backend}"
BACKUP_DIR="${BACKUP_DIR:-/home/enes/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

cd "$APP_DIR"
umask 077
mkdir -p "$BACKUP_DIR"

set -a
source ./.env.production
set +a

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/guvende-$timestamp.dump"
temporary="$target.partial"
trap 'rm -f "$temporary"' EXIT

docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_dump --format=custom --no-owner --no-privileges \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" > "$temporary"

docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_restore --list < "$temporary" >/dev/null
mv "$temporary" "$target"
trap - EXIT

find "$BACKUP_DIR" -type f -name 'guvende-*.dump' -mtime "+$RETENTION_DAYS" -delete
printf 'Backup created and verified: %s\n' "$target"
