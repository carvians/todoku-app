// Utilitas integration test: membuat database bersih + aplikasi + user login
const os = require('os');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createPool } = require('../src/db');
const { migrate } = require('../src/migrate');
const { loadConfig } = require('../src/config');
const createApp = require('../src/app');

const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

async function setup() {
  const pool = createPool(DB_URL);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, () => {});
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todoku-test-'));
  const config = {
    ...loadConfig({ NODE_ENV: 'test', BCRYPT_ROUNDS: '4', AUTH_RATE_LIMIT: '1000', MAX_UPLOAD_MB: '1', MAX_ATTACHMENTS_PER_TASK: '3' }),
    uploadDir,
  };
  const app = createApp({ pool, config });
  return { pool, app, config };
}

let counter = 0;
async function registerUser(app, overrides = {}) {
  counter += 1;
  const body = { name: `User ${counter}`, email: `user${counter}-${Date.now()}@test.id`, password: 'rahasia123', ...overrides };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`Register gagal: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, password: body.password };
}

module.exports = { DB_URL, setup, registerUser };
