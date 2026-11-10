# Anggota 1 — Backend (Node.js + Express) dan Pengujian

Dokumen ini adalah bahan untuk bagian "Detail Aplikasi" di laporan dan untuk video penjelasan. Isinya menjelaskan bagian backend TodoKu v2 yang dipegang Anggota 1.

## 1. Peran backend

Backend adalah container `app` yang berisi REST API berbasis Express 5 dan terhubung ke PostgreSQL. Semua logika bisnis ada di sini: registrasi dan login, kepemilikan data per user, validasi input, lampiran file, dan perhitungan statistik. Browser tidak pernah langsung menyentuh database. Request datang dari Nginx (container `web`) yang meneruskan path `/api/...` ke backend.

## 2. Struktur folder `app/`

| Lokasi | Fungsi |
|---|---|
| `src/server.js` | Titik masuk: membaca konfigurasi, menjalankan migrasi, lalu menyalakan server |
| `src/app.js` | Membuat aplikasi Express: middleware keamanan (helmet), batas ukuran JSON 100 KB, log request, health check, dan pemasangan route |
| `src/config.js` | Membaca environment variable (`DATABASE_URL`, `JWT_SECRET`, `MAX_UPLOAD_MB`, dan lainnya) dan menolak `JWT_SECRET` pendek di produksi |
| `src/db.js`, `src/migrate.js` | Koneksi PostgreSQL dan skema tabel yang dijalankan otomatis saat container start |
| `src/validation.js` | Aturan validasi input untuk registrasi, login, tugas, kategori, dan query daftar |
| `src/errors.js`, `src/middleware/error.js` | Format error JSON yang seragam, termasuk detail error per field |
| `src/middleware/auth.js` | Membuat dan memeriksa token JWT |
| `src/routes/*.js` | Endpoint per fitur: `auth`, `tasks`, `categories`, `attachments`, `stats` |
| `tests/unit/` | Tes unit tanpa database: konfigurasi dan validasi |
| `tests/integration/api.test.js` | Tes integrasi: menjalankan API sungguhan terhadap PostgreSQL |
| `tests/helpers.js` | Membuat database uji dan membersihkannya di antara tes |

## 3. Daftar endpoint

Semua endpoint selain `/api/auth/*` dan `/api/health` memerlukan header `Authorization: Bearer <token>`.

| Metode dan path | Fungsi |
|---|---|
| `GET /api/health` | Status API dan koneksi database. Dipakai Docker HEALTHCHECK dan smoke test |
| `POST /api/auth/register` | Daftar akun baru. Setiap akun langsung mendapat 3 kategori bawaan |
| `POST /api/auth/login` | Login, mengembalikan token JWT |
| `GET /api/auth/me` | Data user yang sedang login |
| `GET /api/tasks` | Daftar tugas dengan filter status, prioritas, kategori, deadline, pencarian teks, sort, dan pagination |
| `GET /api/tasks/:id` | Detail satu tugas beserta daftar lampirannya |
| `POST /api/tasks` | Buat tugas baru (judul, deskripsi, status, prioritas, deadline, kategori) |
| `PATCH /api/tasks/:id` | Ubah sebagian field. Saat status menjadi `done`, `completed_at` otomatis terisi |
| `DELETE /api/tasks/:id` | Hapus tugas beserta file lampirannya |
| `GET/PUT/POST/DELETE /api/categories` | Kelola kategori milik user |
| `POST /api/tasks/:taskId/attachments` | Unggah lampiran |
| `GET /api/tasks/:taskId/attachments` | Daftar lampiran |
| `GET /api/tasks/:taskId/attachments/:id/download` | Unduh lampiran |
| `DELETE /api/tasks/:taskId/attachments/:id` | Hapus lampiran |
| `GET /api/stats` | Ringkasan dashboard: per prioritas, per kategori, harian, dan deadline terdekat |

## 4. Hal teknis yang layak dijelaskan

Isolasi data per user dijaga di setiap query dengan klausa `user_id = $n`. Tes "isolasi data" memastikan user lain tidak bisa melihat, mengubah, atau menghapus tugas milik orang lain. Kategori juga diperiksa kepemilikannya saat tugas dibuat atau diubah.

Password disimpan dalam bentuk hash bcrypt, tidak pernah plain text. Endpoint login dan registrasi dibatasi percobaannya dengan `express-rate-limit` untuk mencegah brute force.

Upload lampiran dibatasi ukurannya (`MAX_UPLOAD_MB`, default 5 MB), jumlahnya per tugas, dan tipe file berbahaya ditolak. File disimpan di volume `uploads` dan dihapus dari disk ketika lampiran atau tugasnya dihapus.

Query daftar tugas memakai parameter `$1, $2, ...` sehingga aman dari SQL injection. Nilai sort dan order hanya menerima daftar yang sudah ditentukan.

## 5. Cara menjalankan tes

Tes membutuhkan PostgreSQL. Cara termudah adalah memakai container database dari compose lalu menjalankan tes dari folder `app`:

```
cd C:\UTS\todoku-app\app
npm ci
npm run test:unit
```

Untuk tes integrasi, arahkan `TEST_DATABASE_URL` ke database uji, misalnya:

```
$env:TEST_DATABASE_URL="postgres://todoku:todoku@localhost:5432/todoku_test"
npm test
```

Perintah `npm test` juga menghasilkan laporan coverage di `app/coverage/`. Laporan ini diunggah sebagai artifact di pipeline CI.

Jika ingin menjalankan semua tes tanpa menyiapkan Node di Windows, cukup gunakan Docker, karena `app/Dockerfile` memiliki tahap `test` yang menjalankan `npm run test:unit` saat build.

## 6. Bukti yang harus dikumpulkan

Screenshot output `npm test` yang menampilkan jumlah tes lulus dan tidak ada yang gagal. Screenshot ringkasan coverage. Screenshot respons `GET /api/health` di browser (`http://localhost:8080/api/health`). Satu contoh request dan respons untuk `POST /api/tasks` untuk ditampilkan di video.

## 7. Poin untuk video

Di video, jelaskan alur satu request: browser mengirim `PATCH /api/tasks/1` dengan token, Nginx meneruskannya ke `app`, middleware memeriksa token, validasi berjalan, query memastikan `user_id` cocok, lalu hasilnya dikembalikan sebagai JSON. Tunjukkan juga bahwa database tidak bisa diakses dari luar karena berada di network `backend` yang bersifat internal.
