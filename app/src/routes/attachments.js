const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { notFound, badRequest, HttpError } = require('../errors');
const { parseId } = require('../middleware/validate');

// Jenis file yang boleh diunggah sebagai lampiran
const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

module.exports = function attachmentRoutes({ pool, config }) {
  const router = express.Router({ mergeParams: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });

  // File disimpan dengan nama acak (bukan nama asli) agar aman dari path traversal
  const upload = multer({
    storage: multer.diskStorage({
      destination: config.uploadDir,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase().slice(0, 10)),
    }),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
      else cb(badRequest(`Tipe file ${file.mimetype} tidak diizinkan`));
    },
  });

  async function ownTask(userId, taskId) {
    const { rows } = await pool.query(
      'SELECT id, (SELECT COUNT(*)::int FROM attachments WHERE task_id = $1) AS n FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId],
    );
    if (!rows[0]) throw notFound('Tugas tidak ditemukan');
    return rows[0];
  }

  // POST /api/tasks/:taskId/attachments  (multipart/form-data, field "file")
  router.post('/', async (req, res) => {
    const taskId = parseId(req.params.taskId);
    const task = await ownTask(req.user.id, taskId);
    if (task.n >= config.maxAttachmentsPerTask) {
      throw badRequest(`Maksimal ${config.maxAttachmentsPerTask} lampiran per tugas`);
    }
    await new Promise((resolve, reject) => upload.single('file')(req, res, (err) => (err ? reject(err) : resolve())));
    if (!req.file) throw badRequest('File wajib diunggah pada field "file"');

    try {
      // Nama file dari browser dikirim dalam latin1, ubah ke UTF-8
      const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 255);
      const { rows } = await pool.query(
        `INSERT INTO attachments (task_id, user_id, original_name, stored_name, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, original_name, mime_type, size_bytes, created_at`,
        [taskId, req.user.id, originalName, req.file.filename, req.file.mimetype, req.file.size],
      );
      await pool.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [taskId]);
      res.status(201).json(rows[0]);
    } catch (err) {
      fs.rmSync(req.file.path, { force: true });
      throw err;
    }
  });

  router.get('/', async (req, res) => {
    const taskId = parseId(req.params.taskId);
    await ownTask(req.user.id, taskId);
    const { rows } = await pool.query(
      'SELECT id, original_name, mime_type, size_bytes, created_at FROM attachments WHERE task_id = $1 ORDER BY created_at',
      [taskId],
    );
    res.json(rows);
  });

  async function findAttachment(req) {
    const { rows } = await pool.query(
      'SELECT * FROM attachments WHERE id = $1 AND task_id = $2 AND user_id = $3',
      [parseId(req.params.id), parseId(req.params.taskId), req.user.id],
    );
    if (!rows[0]) throw notFound('Lampiran tidak ditemukan');
    return rows[0];
  }

  router.get('/:id/download', async (req, res) => {
    const att = await findAttachment(req);
    const filePath = path.join(config.uploadDir, att.stored_name);
    if (!fs.existsSync(filePath)) throw new HttpError(410, 'File lampiran sudah tidak tersedia di server');
    res.download(filePath, att.original_name, { headers: { 'Content-Type': att.mime_type } });
  });

  router.delete('/:id', async (req, res) => {
    const att = await findAttachment(req);
    await pool.query('DELETE FROM attachments WHERE id = $1', [att.id]);
    fs.rmSync(path.join(config.uploadDir, att.stored_name), { force: true });
    res.status(204).end();
  });

  return router;
};
