const express = require('express');
const { notFound } = require('../errors');
const { check, parseId } = require('../middleware/validate');
const { validateCategory } = require('../validation');

module.exports = function categoryRoutes({ pool }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.color, c.created_at,
              COUNT(t.id)::int AS task_count,
              COUNT(t.id) FILTER (WHERE t.status <> 'done')::int AS open_count
         FROM categories c
         LEFT JOIN tasks t ON t.category_id = c.id
        WHERE c.user_id = $1
        GROUP BY c.id
        ORDER BY lower(c.name)`,
      [req.user.id],
    );
    res.json(rows);
  });

  router.post('/', async (req, res) => {
    const { name, color } = check(validateCategory(req.body));
    const { rows } = await pool.query(
      'INSERT INTO categories (user_id, name, color) VALUES ($1, $2, COALESCE($3, \'#4f46e5\')) RETURNING id, name, color, created_at',
      [req.user.id, name, color || null],
    );
    res.status(201).json({ ...rows[0], task_count: 0, open_count: 0 });
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const v = check(validateCategory(req.body, { partial: true }));
    const { rows } = await pool.query(
      `UPDATE categories SET name = COALESCE($3, name), color = COALESCE($4, color)
        WHERE id = $1 AND user_id = $2 RETURNING id, name, color, created_at`,
      [id, req.user.id, v.name ?? null, v.color ?? null],
    );
    if (!rows[0]) throw notFound('Kategori tidak ditemukan');
    res.json(rows[0]);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    // Tugas di dalam kategori tidak ikut terhapus (category_id menjadi NULL)
    const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!rowCount) throw notFound('Kategori tidak ditemukan');
    res.status(204).end();
  });

  return router;
};
