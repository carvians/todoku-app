const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('../errors');
const { check } = require('../middleware/validate');
const { requireAuth, signToken } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../validation');

const DEFAULT_CATEGORIES = [
  ['Kuliah', '#4f46e5'],
  ['Pribadi', '#059669'],
  ['Pekerjaan', '#d97706'],
];

module.exports = function authRoutes({ pool, config }) {
  const router = express.Router();

  // Membatasi percobaan login/registrasi untuk mencegah brute force
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan, coba lagi dalam 15 menit' },
  });

  router.post('/register', limiter, async (req, res) => {
    const { name, email, password } = check(validateRegister(req.body));
    const hash = await bcrypt.hash(password, config.bcryptRounds);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING id, name, email, created_at`,
        [name, email, hash],
      );
      if (!rows[0]) throw new HttpError(409, 'Email sudah terdaftar');
      const user = rows[0];
      // Setiap user baru langsung mendapat beberapa kategori bawaan
      for (const [catName, color] of DEFAULT_CATEGORIES) {
        await client.query('INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3)', [user.id, catName, color]);
      }
      await client.query('COMMIT');
      res.status(201).json({ token: signToken(user, config), user });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  router.post('/login', limiter, async (req, res) => {
    const { email, password } = check(validateLogin(req.body));
    const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) throw new HttpError(401, 'Email atau password salah');
    const { password_hash, ...safe } = user; // eslint-disable-line no-unused-vars
    res.json({ token: signToken(safe, config), user: safe });
  });

  router.get('/me', requireAuth(config), async (req, res) => {
    const { rows } = await pool.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) throw new HttpError(401, 'Akun tidak ditemukan');
    res.json(rows[0]);
  });

  return router;
};
