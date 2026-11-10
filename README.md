# TodoKu v2 — Aplikasi Manajemen Tugas Multi-User (Docker + CI/CD)

TodoKu adalah aplikasi web manajemen tugas dengan **login multi-user, kategori, prioritas,
deadline, lampiran file, pencarian/filter, dan dashboard statistik**. Aplikasi dikemas
menjadi **3 container** (Nginx, Node.js API, PostgreSQL) dan dirilis otomatis melalui
**pipeline CI/CD GitHub Actions**.

```
Browser ──HTTP──> [web: Nginx]  ──/api──> [app: Node.js/Express] ──SQL──> [db: PostgreSQL 16]
                  frontend + reverse proxy      REST API + JWT              data (volume db-data)
                  (network: frontend)           lampiran (volume uploads)   (network: backend, internal)
```

## Struktur proyek

```
todoku-app/
├── app/                         # Backend REST API (image: todoku-api)
│   ├── src/
│   │   ├── server.js            # Entry point: tunggu DB -> migrasi -> start -> graceful shutdown
│   │   ├── app.js               # Rangkaian middleware & routing
│   │   ├── config.js            # Konfigurasi dari environment variable
│   │   ├── db.js / migrate.js   # Koneksi PostgreSQL & migrasi skema otomatis
│   │   ├── migrations/001_init.sql
│   │   ├── routes/              # auth, categories, tasks, attachments, stats
│   │   ├── middleware/          # auth JWT, validasi, error handler
│   │   └── healthcheck.js       # Dipakai HEALTHCHECK Docker
│   ├── tests/unit/              # Unit test (tanpa database)
│   ├── tests/integration/       # Integration test (PostgreSQL sungguhan)
│   └── Dockerfile               # Multi-stage: deps -> test -> runtime
├── nginx/                       # Frontend + reverse proxy (image: todoku-web)
│   ├── public/                  # index.html, css/style.css, js/app.js
│   ├── default.conf.template    # Konfigurasi Nginx (envsubst)
│   └── Dockerfile
├── scripts/
│   ├── deploy.sh                # Backup DB -> pull -> up -> health check -> rollback otomatis
│   ├── smoke-test.sh            # Uji end-to-end 15 skenario
│   └── backup-db.sh             # Backup / restore database
├── .github/workflows/
│   ├── ci-cd.yml                # Pipeline utama CI/CD
│   └── rollback.yml             # Rollback manual ke versi tertentu
├── docker-compose.yml           # Menjalankan lokal (build dari source)
├── docker-compose.prod.yml      # Produksi (pull image dari GHCR)
└── .env.example
```

## Menjalankan dengan Docker (lokal)

```bash
cp .env.example .env            # opsional untuk lokal, ada nilai default
docker compose up -d --build
docker compose ps               # ketiga container berstatus "healthy"
# buka http://localhost:8080
./scripts/smoke-test.sh http://localhost:8080
docker compose logs -f app
docker compose down             # hentikan (data tetap di volume)
docker compose down -v          # hentikan + hapus data
```

## Menjalankan dengan Podman

```bash
podman compose up -d --build    # atau: podman-compose up -d --build
```

## Menjalankan tanpa container (development)

```bash
cd app && npm install
DATABASE_URL=postgres://todoku:todoku@localhost:5432/todoku STATIC_DIR=../nginx/public npm run dev
# test
npm run test:unit
TEST_DATABASE_URL=postgres://todoku:todoku@localhost:5432/todoku_test npm test
```

## REST API

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | /api/health | Status app & database, versi |
| POST | /api/auth/register | Daftar `{name, email, password}` |
| POST | /api/auth/login | Login → token JWT |
| GET | /api/auth/me | Profil user login |
| GET/POST | /api/categories | Daftar / tambah kategori |
| PUT/DELETE | /api/categories/:id | Ubah / hapus kategori |
| GET | /api/tasks | Daftar tugas. Query: `q, status, priority, category_id, due (overdue/today/week/none), sort, order, page, limit` |
| POST | /api/tasks | Tambah `{title, description, status, priority, due_date, category_id}` |
| GET/PATCH/DELETE | /api/tasks/:id | Detail (+lampiran) / ubah sebagian / hapus |
| GET/POST | /api/tasks/:id/attachments | Daftar / unggah lampiran (multipart, field `file`) |
| GET | /api/tasks/:id/attachments/:aid/download | Unduh lampiran |
| DELETE | /api/tasks/:id/attachments/:aid | Hapus lampiran |
| GET | /api/stats | Data dashboard |

Semua endpoint selain health & auth wajib header `Authorization: Bearer <token>`.

## Setup CI/CD

1. Push folder ini ke repository GitHub (branch `main`).
2. **Settings → Secrets and variables → Actions**
   - Secrets: `POSTGRES_PASSWORD`, `JWT_SECRET` (buat: `openssl rand -hex 32`)
   - Variable `DEPLOY_TARGET` = `vps` atau `self-hosted`
3. **Jika `vps`**: tambah secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (opsional `VPS_PORT`),
   variable `APP_HOST`. Di VPS: instal Docker (`curl -fsSL https://get.docker.com | sh`),
   `sudo usermod -aG docker $USER`, buka port 80.
4. **Jika `self-hosted`**: Settings → Actions → Runners → *New self-hosted runner*,
   ikuti perintahnya di Linux/WSL2 yang sudah ada Docker, beri label tambahan `todoku`.
   Opsional variable `WEB_PORT` (default 8080) dan `DEPLOY_DIR`.
5. Push ke `main` → pipeline: test → build & E2E → push image ke GHCR → deploy → smoke test.
6. Rollback: tab Actions → **Rollback TodoKu** → isi tag (7 karakter SHA) atau `rollback`.
