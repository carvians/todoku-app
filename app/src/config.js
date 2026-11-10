// Seluruh konfigurasi dibaca dari environment variable (prinsip 12-Factor App),
// sehingga image yang sama bisa dipakai di lokal, CI, maupun produksi.
const path = require('path');
const pkg = require('../package.json');

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const config = {
    env: nodeEnv,
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || 'postgres://todoku:todoku@localhost:5432/todoku',
    jwtSecret: env.JWT_SECRET || (nodeEnv === 'production' ? '' : 'dev-secret-jangan-dipakai-di-produksi'),
    jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
    bcryptRounds: Number(env.BCRYPT_ROUNDS || 10),
    uploadDir: env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
    maxUploadMb: Number(env.MAX_UPLOAD_MB || 5),
    maxAttachmentsPerTask: Number(env.MAX_ATTACHMENTS_PER_TASK || 10),
    authRateLimit: Number(env.AUTH_RATE_LIMIT || 20),
    staticDir: env.STATIC_DIR || '',
    version: env.APP_VERSION || pkg.version,
  };

  if (nodeEnv === 'production' && config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET wajib diisi minimal 32 karakter pada mode produksi');
  }
  return config;
}

module.exports = { loadConfig };
