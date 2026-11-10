// Menjalankan migrasi secara manual: npm run migrate
const { loadConfig } = require('./config');
const { createPool, waitForDb } = require('./db');
const { migrate } = require('./migrate');

(async () => {
  const pool = createPool(loadConfig().databaseUrl);
  try {
    await waitForDb(pool, { retries: 10 });
    await migrate(pool);
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
