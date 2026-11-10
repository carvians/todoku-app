#!/usr/bin/env bash
# =====================================================================
# deploy.sh - Deploy TodoKu versi tertentu dengan rollback otomatis
# Dipanggil oleh pipeline CD (via SSH ke VPS, atau langsung oleh
# self-hosted runner). Bisa juga dijalankan manual:
#
#   ./scripts/deploy.sh <IMAGE_TAG>        # deploy versi tertentu
#   ./scripts/deploy.sh rollback           # kembali ke versi sebelumnya
#
# Langkah:
#   1. Backup database (pg_dump) sebelum update
#   2. Pull image baru dari registry
#   3. Recreate container app & web (db tetap jalan, data aman di volume)
#   4. Health check; jika gagal -> otomatis rollback ke versi sebelumnya
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
STATE_DIR=".deploy"
mkdir -p "$STATE_DIR" backups

[ -f .env ] || { echo "File .env tidak ditemukan. Salin dari .env.example"; exit 1; }
set -a; . ./.env; set +a
WEB_PORT="${WEB_PORT:-80}"

current_tag="$(cat "$STATE_DIR/current" 2>/dev/null || echo "")"
previous_tag="$(cat "$STATE_DIR/previous" 2>/dev/null || echo "")"

if [ "${1:-}" = "rollback" ]; then
  [ -n "$previous_tag" ] || { echo "Tidak ada versi sebelumnya untuk rollback"; exit 1; }
  target="$previous_tag"
else
  target="${1:-${IMAGE_TAG:-latest}}"
fi

log() { echo "[deploy $(date +%H:%M:%S)] $*"; }

health_check() {
  local tag="$1"
  for i in $(seq 1 30); do
    body="$(curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health" 2>/dev/null || true)"
    if echo "$body" | grep -q '"status":"ok"'; then
      if [ "$tag" = "latest" ] || echo "$body" | grep -q "$tag"; then
        log "Health check OK: $body"
        return 0
      fi
    fi
    log "Menunggu aplikasi siap... ($i/30)"
    sleep 3
  done
  return 1
}

up_with_tag() {
  export IMAGE_TAG="$1"
  $COMPOSE pull app web
  $COMPOSE up -d --remove-orphans
}

log "Versi saat ini : ${current_tag:-<belum ada>}"
log "Versi target   : $target"

# 1. Backup database jika container db sudah berjalan
if $COMPOSE ps --status running db 2>/dev/null | grep -q db; then
  backup="backups/todoku-$(date +%Y%m%d-%H%M%S).sql.gz"
  log "Backup database -> $backup"
  $COMPOSE exec -T db pg_dump -U "${POSTGRES_USER:-todoku}" "${POSTGRES_DB:-todoku}" | gzip > "$backup"
  ls -1t backups/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f   # simpan 7 backup terakhir
fi

# 2-3. Pull & jalankan versi target
up_with_tag "$target"

# 4. Verifikasi
if health_check "$target"; then
  if [ "$target" != "$current_tag" ]; then
    [ -n "$current_tag" ] && echo "$current_tag" > "$STATE_DIR/previous"
    echo "$target" > "$STATE_DIR/current"
  fi
  docker image prune -f >/dev/null
  log "DEPLOY BERHASIL: versi $target sudah melayani pengguna"
  $COMPOSE ps
  exit 0
fi

log "Health check GAGAL untuk versi $target"
$COMPOSE logs --tail=50 app || true
if [ -n "$current_tag" ] && [ "$current_tag" != "$target" ]; then
  log "ROLLBACK otomatis ke versi $current_tag"
  up_with_tag "$current_tag"
  health_check "$current_tag" && log "Rollback berhasil, aplikasi kembali ke versi $current_tag"
fi
exit 1
