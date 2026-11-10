// Migrasi skema database sederhana: setiap file .sql di folder migrations
// dijalankan berurutan satu kali saja dan dicatat di tabel schema_migrations.
// Advisory lock mencegah dua container aplikasi menjalankan migrasi bersamaan.
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_ID = 727274;

async function migrate(pool, log = console.log) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`Migrasi diterapkan: ${file}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migrasi ${file} gagal: ${err.message}`);
      }
    }
    if (count === 0) log('Skema database sudah terbaru');
    return count;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { migrate };
