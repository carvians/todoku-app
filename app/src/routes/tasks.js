const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { notFound, badRequest } = require('../errors');
const { check, parseId } = require('../middleware/validate');
const { validateTask, validateTaskQuery, SORTS } = require('../validation');

const TASK_COLUMNS = `
  t.id, t.title, t.description, t.status, t.priority, t.due_date, t.category_id,
  t.completed_at, t.created_at, t.updated_at,
  c.name AS category_name, c.color AS category_color,
  (SELECT COUNT(*)::int FROM attachments a WHERE a.task_id = t.id) AS attachment_count,
  (t.due_date < CURRENT_DATE AND t.status <> 'done') AS is_overdue`;

const PRIORITY_RANK = `CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;

module.exports = function taskRoutes({ pool, config }) {
  const router = express.Router();

  async function ensureCategory(userId, categoryId) {
    if (categoryId === null || categoryId === undefined) return;
    const { rowCount } = await pool.query('SELECT 1 FROM categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
    if (!rowCount) throw badRequest('Data tidak valid', { category_id: 'Kategori tidak ditemukan' });
  }

  async function getTask(userId, id) {
    const { rows } = await pool.query(
      `SELECT ${TASK_COLUMNS} FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.id = $1 AND t.user_id = $2`,
      [id, userId],
    );
    if (!rows[0]) throw notFound('Tugas tidak ditemukan');
    return rows[0];
  }

  // GET /api/tasks?status=&priority=&category_id=&due=&q=&sort=&order=&page=&limit=
  router.get('/', async (req, res) => {
    const q = check(validateTaskQuery(req.query));
    const where = ['t.user_id = $1'];
    const params = [req.user.id];
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };

    if (q.status) add('t.status = ?', q.status);
    if (q.priority) add('t.priority = ?', q.priority);
    if (q.category_id === 'none') where.push('t.category_id IS NULL');
    else if (q.category_id) add('t.category_id = ?', q.category_id);
    if (q.due === 'overdue') where.push(`t.due_date < CURRENT_DATE AND t.status <> 'done'`);
    if (q.due === 'today') where.push('t.due_date = CURRENT_DATE');
    if (q.due === 'week') where.push(`t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`);
    if (q.due === 'none') where.push('t.due_date IS NULL');
    if (q.q) {
      params.push(`%${q.q}%`);
      const n = params.length;
      where.push(`(t.title ILIKE $${n} OR t.description ILIKE $${n})`);
    }

    const whereSql = where.join(' AND ');
    const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM tasks t WHERE ${whereSql}`, params)).rows[0].n;

    const orderCol = SORTS[q.sort] === 'priority_rank' ? PRIORITY_RANK : SORTS[q.sort];
    const offset = (q.page - 1) * q.limit;
    const { rows } = await pool.query(
      `SELECT ${TASK_COLUMNS} FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
        WHERE ${whereSql}
        ORDER BY ${orderCol} ${q.order} NULLS LAST, t.id DESC
        LIMIT ${q.limit} OFFSET ${offset}`,
      params,
    );
    res.json({
      data: rows,
      pagination: { page: q.page, limit: q.limit, total, total_pages: Math.max(1, Math.ceil(total / q.limit)) },
    });
  });

  router.get('/:id', async (req, res) => {
    const task = await getTask(req.user.id, parseId(req.params.id));
    const { rows } = await pool.query(
      'SELECT id, original_name, mime_type, size_bytes, created_at FROM attachments WHERE task_id = $1 ORDER BY created_at',
      [task.id],
    );
    res.json({ ...task, attachments: rows });
  });

  router.post('/', async (req, res) => {
    const v = check(validateTask(req.body));
    await ensureCategory(req.user.id, v.category_id);
    const status = v.status || 'todo';
    const { rows } = await pool.query(
      `INSERT INTO tasks (user_id, title, description, status, priority, due_date, category_id, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $4::varchar = 'done' THEN now() END)
       RETURNING id`,
      [req.user.id, v.title, v.description || '', status, v.priority || 'medium', v.due_date ?? null, v.category_id ?? null],
    );
    res.status(201).json(await getTask(req.user.id, rows[0].id));
  });

  // PATCH: ubah sebagian field (judul, status, prioritas, deadline, kategori, deskripsi)
  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const v = check(validateTask(req.body, { partial: true }));
    if (v.category_id !== undefined) await ensureCategory(req.user.id, v.category_id);

    const sets = [];
    const params = [id, req.user.id];
    for (const [key, value] of Object.entries(v)) {
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    if (v.status !== undefined) {
      // completed_at diisi saat tugas pertama kali selesai, dikosongkan jika dibuka lagi.
      // Pada klausa SET, kolom "status" masih bernilai lama (sebelum UPDATE).
      const n = params.indexOf(v.status, 2) + 1;
      sets.push(`completed_at = CASE WHEN $${n}::varchar <> 'done' THEN NULL
                                     WHEN status = 'done' THEN completed_at
                                     ELSE now() END`);
    }
    sets.push('updated_at = now()');
    const { rowCount } = await pool.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
      params,
    );
    if (!rowCount) throw notFound('Tugas tidak ditemukan');
    res.json(await getTask(req.user.id, id));
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const files = await pool.query('SELECT stored_name FROM attachments WHERE task_id = $1 AND user_id = $2', [id, req.user.id]);
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!rowCount) throw notFound('Tugas tidak ditemukan');
    // Hapus file lampiran fisik dari volume
    await Promise.all(files.rows.map((f) => fs.rm(path.join(config.uploadDir, f.stored_name), { force: true })));
    res.status(204).end();
  });

  return router;
};
