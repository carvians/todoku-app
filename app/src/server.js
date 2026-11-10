const { loadConfig } = require('./config');
const { createPool, waitForDb } = require('./db');
const { migrate } = require('./migrate');
const createApp = require('./app');

async function main() {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);

  // 1. Tunggu container PostgreSQL siap, 2. jalankan migrasi skema, 3. start server
  await waitForDb(pool);
  await migrate(pool);

  const app = createApp({ pool, config });
  const server = app.listen(config.port, () => {
    console.log(`TodoKu API v${config.version} berjalan di port ${config.port} (${config.env})`);
  });

  // Graceful shutdown: "docker stop" mengirim SIGTERM. Server berhenti menerima
  // request baru, menyelesaikan request yang berjalan, lalu menutup koneksi DB.
  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`${signal} diterima, menutup server...`);
    server.close(async () => {
      await pool.end();
      console.log('Server dan koneksi database ditutup');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Gagal menjalankan server:', err.message);
  process.exit(1);
});
