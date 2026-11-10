#!/usr/bin/env bash
# =====================================================================
# smoke-test.sh - Uji end-to-end terhadap stack yang sedang berjalan
#   ./scripts/smoke-test.sh http://localhost:8080 [versi-yang-diharapkan]
# Menguji alur lengkap melewati Nginx -> App -> PostgreSQL:
# health, halaman web, registrasi, login, buat tugas, upload & download
# lampiran, statistik, header keamanan. Keluar dengan kode 1 jika gagal.
# =====================================================================
set -uo pipefail
BASE="${1:-http://localhost:8080}"
EXPECT_VERSION="${2:-}"
PASS=0; FAIL=0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

ok()   { echo "  [OK]   $1"; PASS=$((PASS+1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }
json() { sed -nE "s/.*\"$1\":\"?([^\",}]*)\"?.*/\1/p" | head -1; }

echo "Smoke test terhadap $BASE"

# Tunggu stack siap (maks 90 detik)
for _ in $(seq 1 30); do
  curl -fsS "$BASE/api/health" >/dev/null 2>&1 && break
  sleep 3
done

health="$(curl -fsS "$BASE/api/health" || true)"
echo "$health" | grep -q '"status":"ok"' && ok "GET /api/health -> $health" || fail "health check: $health"
echo "$health" | grep -q '"database":"up"' && ok "koneksi app -> PostgreSQL" || fail "database tidak terhubung"
if [ -n "$EXPECT_VERSION" ]; then
  echo "$health" | grep -q "$EXPECT_VERSION" && ok "versi yang berjalan = $EXPECT_VERSION" || fail "versi tidak sesuai (harap $EXPECT_VERSION)"
fi

page="$(curl -fsS -D "$TMP/h" "$BASE/" || true)"
echo "$page" | grep -q "<title>TodoKu" && ok "halaman web disajikan" || fail "halaman web tidak tampil"
grep -qi "x-content-type-options: nosniff" "$TMP/h" && ok "header keamanan aktif" || echo "  [INFO] header keamanan tidak terdeteksi (normal jika tanpa Nginx)"
curl -fsS "$BASE/js/app.js" -o /dev/null && ok "aset JavaScript tersedia" || fail "app.js tidak ditemukan"

EMAIL="smoke$(date +%s)$RANDOM@test.local"
reg="$(curl -sS -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Test\",\"email\":\"$EMAIL\",\"password\":\"smoketest123\"}")"
TOKEN="$(echo "$reg" | json token)"
[ -n "$TOKEN" ] && ok "registrasi user baru" || fail "registrasi: $reg"

login="$(curl -sS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"smoketest123\"}")"
echo "$login" | grep -q '"token"' && ok "login" || fail "login: $login"

code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/tasks")"
[ "$code" = "401" ] && ok "endpoint terlindungi tanpa token -> 401" || fail "tanpa token mendapat $code"

AUTH="Authorization: Bearer $TOKEN"
task="$(curl -sS -X POST "$BASE/api/tasks" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"title":"Tugas smoke test","priority":"high","due_date":"2030-01-01"}')"
TASK_ID="$(echo "$task" | json id)"
[ -n "$TASK_ID" ] && ok "buat tugas (id=$TASK_ID)" || fail "buat tugas: $task"

echo "isi lampiran smoke test" > "$TMP/lampiran.txt"
att="$(curl -sS -X POST "$BASE/api/tasks/$TASK_ID/attachments" -H "$AUTH" -F "file=@$TMP/lampiran.txt;type=text/plain")"
ATT_ID="$(echo "$att" | json id)"
[ -n "$ATT_ID" ] && ok "upload lampiran melalui Nginx" || fail "upload: $att"

dl="$(curl -sS "$BASE/api/tasks/$TASK_ID/attachments/$ATT_ID/download" -H "$AUTH")"
[ "$dl" = "isi lampiran smoke test" ] && ok "download lampiran (file tersimpan di volume)" || fail "download: $dl"

upd="$(curl -sS -X PATCH "$BASE/api/tasks/$TASK_ID" -H "$AUTH" -H 'Content-Type: application/json' -d '{"status":"done"}')"
echo "$upd" | grep -q '"status":"done"' && ok "tandai tugas selesai" || fail "update: $upd"

stats="$(curl -sS "$BASE/api/stats" -H "$AUTH")"
echo "$stats" | grep -q '"completion_rate":100' && ok "statistik dashboard" || fail "stats: $stats"

code="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/tasks/$TASK_ID" -H "$AUTH")"
[ "$code" = "204" ] && ok "hapus tugas" || fail "hapus mendapat $code"

echo "Hasil: $PASS lulus, $FAIL gagal"
[ "$FAIL" -eq 0 ]
