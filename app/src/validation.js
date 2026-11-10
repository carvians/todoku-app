// Validasi input tanpa library tambahan. Setiap fungsi mengembalikan
// { value, errors }. Jika errors tidak kosong, request ditolak dengan 400.

const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function str(v) {
  return typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim();
}

function validateRegister(body = {}) {
  const errors = {};
  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (name.length < 2 || name.length > 100) errors.name = 'Nama 2-100 karakter';
  if (!EMAIL_RE.test(email) || email.length > 255) errors.email = 'Format email tidak valid';
  if (password.length < 8) errors.password = 'Password minimal 8 karakter';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Password harus mengandung huruf dan angka';
  else if (password.length > 72) errors.password = 'Password maksimal 72 karakter';
  return { value: { name, email, password }, errors };
}

function validateLogin(body = {}) {
  const errors = {};
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email) errors.email = 'Email wajib diisi';
  if (!password) errors.password = 'Password wajib diisi';
  return { value: { email, password }, errors };
}

function validateCategory(body = {}, { partial = false } = {}) {
  const errors = {};
  const value = {};
  if (!partial || body.name !== undefined) {
    const name = str(body.name);
    if (!name || name.length > 50) errors.name = 'Nama kategori 1-50 karakter';
    value.name = name;
  }
  if (body.color !== undefined) {
    if (!COLOR_RE.test(str(body.color))) errors.color = 'Warna harus format hex, contoh #4f46e5';
    value.color = str(body.color).toLowerCase();
  }
  return { value, errors };
}

function validateTask(body = {}, { partial = false } = {}) {
  const errors = {};
  const value = {};

  if (!partial || body.title !== undefined) {
    const title = str(body.title);
    if (!title) errors.title = 'Judul tugas wajib diisi';
    else if (title.length > 200) errors.title = 'Judul maksimal 200 karakter';
    value.title = title;
  }
  if (body.description !== undefined) {
    const description = str(body.description);
    if (description.length > 5000) errors.description = 'Deskripsi maksimal 5000 karakter';
    value.description = description;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.status = `Status harus salah satu dari: ${STATUSES.join(', ')}`;
    value.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) errors.priority = `Prioritas harus salah satu dari: ${PRIORITIES.join(', ')}`;
    value.priority = body.priority;
  }
  if (body.due_date !== undefined) {
    if (body.due_date === null || body.due_date === '') value.due_date = null;
    else if (!isValidDate(str(body.due_date))) errors.due_date = 'Tanggal harus format YYYY-MM-DD';
    else value.due_date = str(body.due_date);
  }
  if (body.category_id !== undefined) {
    if (body.category_id === null || body.category_id === '') value.category_id = null;
    else {
      const id = Number(body.category_id);
      if (!Number.isInteger(id) || id < 1) errors.category_id = 'category_id tidak valid';
      value.category_id = id;
    }
  }
  if (partial && Object.keys(value).length === 0 && Object.keys(errors).length === 0) {
    errors._ = 'Tidak ada data yang diubah';
  }
  return { value, errors };
}

const SORTS = { created_at: 't.created_at', due_date: 't.due_date', priority: 'priority_rank', title: 'lower(t.title)', updated_at: 't.updated_at' };

function validateTaskQuery(q = {}) {
  const errors = {};
  const value = {
    page: Math.max(1, parseInt(q.page, 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20)),
    sort: SORTS[q.sort] ? q.sort : 'created_at',
    order: String(q.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC',
  };
  if (q.status) {
    if (!STATUSES.includes(q.status)) errors.status = 'Filter status tidak valid';
    value.status = q.status;
  }
  if (q.priority) {
    if (!PRIORITIES.includes(q.priority)) errors.priority = 'Filter prioritas tidak valid';
    value.priority = q.priority;
  }
  if (q.category_id) {
    if (q.category_id === 'none') value.category_id = 'none';
    else {
      const id = Number(q.category_id);
      if (!Number.isInteger(id) || id < 1) errors.category_id = 'Filter kategori tidak valid';
      value.category_id = id;
    }
  }
  if (q.due) {
    if (!['overdue', 'today', 'week', 'none'].includes(q.due)) errors.due = 'Filter due harus overdue, today, week, atau none';
    value.due = q.due;
  }
  if (q.q) value.q = str(q.q).slice(0, 100);
  return { value, errors };
}

module.exports = {
  STATUSES, PRIORITIES, SORTS,
  isValidDate, validateRegister, validateLogin, validateCategory, validateTask, validateTaskQuery,
};
