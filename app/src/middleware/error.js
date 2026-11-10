const multer = require('multer');
const { HttpError } = require('../errors');

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Endpoint ${req.method} ${req.path} tidak ditemukan` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const messages = {
      LIMIT_FILE_SIZE: 'Ukuran file melebihi batas',
      LIMIT_UNEXPECTED_FILE: 'Field file harus bernama "file"',
    };
    return res.status(status).json({ error: messages[err.code] || err.message });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body JSON tidak valid' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Body request terlalu besar' });
  // Pelanggaran unique constraint PostgreSQL
  if (err.code === '23505') return res.status(409).json({ error: 'Data sudah ada' });

  console.error('[ERROR]', req.method, req.originalUrl, err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
}

module.exports = { notFoundHandler, errorHandler };
