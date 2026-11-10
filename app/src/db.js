const { Pool } = require('pg');

function createPool(connectionString) {
  return new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });
}

// Saat docker compose up, container database bisa saja belum siap menerima
// koneksi. Fungsi ini mencoba ulang beberapa kali sebelum menyerah.
async function waitForDb(pool, { retries = 30, delayMs = 2000, log = console.log } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      log(`Database siap (percobaan ke-${attempt})`);
      return;
    } catch (err) {
      log(`Menunggu database... (${attempt}/${retries}) ${err.code || err.message}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

module.exports = { createPool, waitForDb };

// Kolom DATE (OID 1082) dikembalikan apa adanya sebagai string "YYYY-MM-DD"
// agar tidak bergeser zona waktu saat diubah menjadi objek Date JavaScript.
require('pg').types.setTypeParser(1082, (v) => v);
