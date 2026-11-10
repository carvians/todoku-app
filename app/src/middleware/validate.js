const { badRequest } = require('../errors');

// Membungkus fungsi validasi: jika ada error, lempar 400 beserta detail per field
function check({ value, errors }) {
  if (Object.keys(errors).length) throw badRequest('Data tidak valid', errors);
  return value;
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw badRequest('ID tidak valid');
  return id;
}

module.exports = { check, parseId };
