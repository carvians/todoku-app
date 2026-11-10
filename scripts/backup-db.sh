#!/usr/bin/env bash
# Backup / restore database TodoKu yang berjalan di container
#   ./scripts/backup-db.sh                  -> buat backup ke folder backups/
#   ./scripts/backup-db.sh restore <file>   -> pulihkan dari file backup
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${COMPOSE_FILE_NAME:-docker-compose.prod.yml}"
COMPOSE="docker compose -f $FILE"
[ -f .env ] && { set -a; . ./.env; set +a; }
U="${POSTGRES_USER:-todoku}"; D="${POSTGRES_DB:-todoku}"
mkdir -p backups

if [ "${1:-}" = "restore" ]; then
  [ -f "${2:-}" ] || { echo "Gunakan: $0 restore backups/<file>.sql.gz"; exit 1; }
  echo "Memulihkan $2 ke database $D ..."
  $COMPOSE exec -T db psql -U "$U" -d "$D" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  gunzip -c "$2" | $COMPOSE exec -T db psql -U "$U" -d "$D" -q
  $COMPOSE restart app
  echo "Selesai."
else
  out="backups/todoku-$(date +%Y%m%d-%H%M%S).sql.gz"
  $COMPOSE exec -T db pg_dump -U "$U" "$D" | gzip > "$out"
  echo "Backup tersimpan: $out"
fi
