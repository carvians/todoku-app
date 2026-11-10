const express = require('express');
const helmet = require('helmet');
const { requireAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/error');

// createApp menerima dependency (pool database & config) dari luar,
// sehingga mudah diuji dengan database pengujian.
function createApp({ pool, config }) {
  const app = express();
  const auth = requireAuth(config);

  app.disable('x-powered-by');
  // Di belakang reverse proxy Nginx: percayai header X-Forwarded-For (untuk rate limit)
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '100kb' }));

  // Log request sederhana (ditampilkan oleh "docker compose logs app")
  if (config.env !== 'test') {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
      next();
    });
  }

  // Health check: dipakai Docker HEALTHCHECK, Nginx, dan smoke test pipeline CD
  app.get('/api/health', async (req, res) => {
    let database = 'up';
    try {
      await pool.query('SELECT 1');
    } catch {
      database = 'down';
    }
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      version: config.version,
      database,
      uptime: Math.round(process.uptime()),
    });
  });

  const deps = { pool, config };
  app.use('/api/auth', require('./routes/auth')(deps));
  app.use('/api/categories', auth, require('./routes/categories')(deps));
  app.use('/api/tasks/:taskId/attachments', auth, require('./routes/attachments')(deps));
  app.use('/api/tasks', auth, require('./routes/tasks')(deps));
  app.use('/api/stats', auth, require('./routes/stats')(deps));

  // Opsional: menyajikan frontend langsung dari Node (tanpa Nginx) saat development
  if (config.staticDir) app.use(express.static(config.staticDir));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
