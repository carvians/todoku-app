// Integration test terhadap PostgreSQL sungguhan.
// Di pipeline CI, database disediakan oleh "service container" postgres.
const fs = require('fs');
const request = require('supertest');
const { DB_URL, setup, registerUser } = require('../helpers');

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn('TEST_DATABASE_URL tidak diset: integration test dilewati');

const isoDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

describeDb('TodoKu API (integration)', () => {
  let ctx;
  beforeAll(async () => { ctx = await setup(); });
  afterAll(async () => {
    await ctx.pool.end();
    fs.rmSync(ctx.config.uploadDir, { recursive: true, force: true });
  });

  const api = () => request(ctx.app);
  const as = (token) => ({
    get: (url) => api().get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => api().post(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => api().patch(url).set('Authorization', `Bearer ${token}`),
    put: (url) => api().put(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => api().delete(url).set('Authorization', `Bearer ${token}`),
  });

  describe('Health check', () => {
    test('GET /api/health melaporkan status database', async () => {
      const res = await api().get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    });

    test('endpoint tidak dikenal mengembalikan 404 JSON', async () => {
      const res = await api().get('/api/tidak-ada');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('Autentikasi', () => {
    test('registrasi, login, dan /me', async () => {
      const email = `andi${Date.now()}@test.id`;
      const reg = await api().post('/api/auth/register').send({ name: 'Andi', email, password: 'rahasia123' });
      expect(reg.status).toBe(201);
      expect(reg.body.token).toBeDefined();
      expect(reg.body.user).not.toHaveProperty('password_hash');

      const login = await api().post('/api/auth/login').send({ email: email.toUpperCase(), password: 'rahasia123' });
      expect(login.status).toBe(200);

      const me = await as(login.body.token).get('/api/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(email);
    });

    test('email duplikat ditolak 409', async () => {
      const { user } = await registerUser(ctx.app);
      const res = await api().post('/api/auth/register').send({ name: 'Xavier', email: user.email, password: 'rahasia123' });
      expect(res.status).toBe(409);
    });

    test('password salah ditolak 401', async () => {
      const { user } = await registerUser(ctx.app);
      const res = await api().post('/api/auth/login').send({ email: user.email, password: 'salah1234' });
      expect(res.status).toBe(401);
    });

    test('validasi registrasi mengembalikan detail per field', async () => {
      const res = await api().post('/api/auth/register').send({ name: 'A', email: 'x', password: '123' });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    });

    test('endpoint terlindungi menolak tanpa token / token palsu', async () => {
      expect((await api().get('/api/tasks')).status).toBe(401);
      expect((await as('token.palsu.sekali').get('/api/tasks')).status).toBe(401);
    });
  });

  describe('Kategori', () => {
    test('user baru mendapat 3 kategori bawaan; CRUD kategori', async () => {
      const { token } = await registerUser(ctx.app);
      const list = await as(token).get('/api/categories');
      expect(list.body.map((c) => c.name).sort()).toEqual(['Kuliah', 'Pekerjaan', 'Pribadi']);

      const created = await as(token).post('/api/categories').send({ name: 'Organisasi', color: '#e11d48' });
      expect(created.status).toBe(201);
      const dup = await as(token).post('/api/categories').send({ name: 'organisasi' });
      expect(dup.status).toBe(409);

      const upd = await as(token).put(`/api/categories/${created.body.id}`).send({ name: 'UKM' });
      expect(upd.body).toMatchObject({ name: 'UKM', color: '#e11d48' });

      expect((await as(token).delete(`/api/categories/${created.body.id}`)).status).toBe(204);
    });

    test('menghapus kategori tidak menghapus tugasnya', async () => {
      const { token } = await registerUser(ctx.app);
      const cat = (await as(token).post('/api/categories').send({ name: 'Sementara' })).body;
      const task = (await as(token).post('/api/tasks').send({ title: 'Tetap ada', category_id: cat.id })).body;
      await as(token).delete(`/api/categories/${cat.id}`);
      const after = await as(token).get(`/api/tasks/${task.id}`);
      expect(after.status).toBe(200);
      expect(after.body.category_id).toBeNull();
    });
  });

  describe('Tugas', () => {
    test('membuat tugas lengkap dengan detail', async () => {
      const { token } = await registerUser(ctx.app);
      const cats = (await as(token).get('/api/categories')).body;
      const res = await as(token).post('/api/tasks').send({
        title: 'Laporan UTS', description: 'Bab 1-8', priority: 'high', due_date: isoDate(3), category_id: cats[0].id,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        title: 'Laporan UTS', description: 'Bab 1-8', status: 'todo', priority: 'high',
        due_date: isoDate(3), category_name: cats[0].name, attachment_count: 0, is_overdue: false,
      });
    });

    test('tidak bisa memakai kategori milik user lain', async () => {
      const a = await registerUser(ctx.app);
      const b = await registerUser(ctx.app);
      const catA = (await as(a.token).get('/api/categories')).body[0];
      const res = await as(b.token).post('/api/tasks').send({ title: 'x', category_id: catA.id });
      expect(res.status).toBe(400);
      expect(res.body.details.category_id).toBeDefined();
    });

    test('PATCH status mengatur completed_at', async () => {
      const { token } = await registerUser(ctx.app);
      const t = (await as(token).post('/api/tasks').send({ title: 'Selesaikan' })).body;
      const done = await as(token).patch(`/api/tasks/${t.id}`).send({ status: 'done' });
      expect(done.body.status).toBe('done');
      expect(done.body.completed_at).not.toBeNull();

      const again = await as(token).patch(`/api/tasks/${t.id}`).send({ status: 'done', title: 'Selesaikan!' });
      expect(again.body.completed_at).toBe(done.body.completed_at);

      const reopen = await as(token).patch(`/api/tasks/${t.id}`).send({ status: 'in_progress' });
      expect(reopen.body.completed_at).toBeNull();
    });

    test('filter, pencarian, sort, dan pagination', async () => {
      const { token } = await registerUser(ctx.app);
      const c = as(token);
      await c.post('/api/tasks').send({ title: 'Belajar Docker', priority: 'high', due_date: isoDate(-2) });
      await c.post('/api/tasks').send({ title: 'Belajar Kubernetes', priority: 'low', due_date: isoDate(0) });
      await c.post('/api/tasks').send({ title: 'Beli kopi', description: 'docker cafe', priority: 'medium' });
      const done = (await c.post('/api/tasks').send({ title: 'Sudah lewat tapi selesai', due_date: isoDate(-5) })).body;
      await c.patch(`/api/tasks/${done.id}`).send({ status: 'done' });

      expect((await c.get('/api/tasks?q=docker')).body.pagination.total).toBe(2);
      expect((await c.get('/api/tasks?priority=high')).body.data[0].title).toBe('Belajar Docker');
      const overdue = (await c.get('/api/tasks?due=overdue')).body.data;
      expect(overdue.map((t) => t.title)).toEqual(['Belajar Docker']);
      expect(overdue[0].is_overdue).toBe(true);
      expect((await c.get('/api/tasks?due=today')).body.data[0].title).toBe('Belajar Kubernetes');
      expect((await c.get('/api/tasks?status=done')).body.pagination.total).toBe(1);

      const sorted = (await c.get('/api/tasks?sort=priority&order=desc&status=todo')).body.data.map((t) => t.priority);
      expect(sorted).toEqual(['high', 'medium', 'low']);

      const page = await c.get('/api/tasks?limit=3&page=2');
      expect(page.body.pagination).toMatchObject({ page: 2, limit: 3, total: 4, total_pages: 2 });
      expect(page.body.data).toHaveLength(1);
    });

    test('isolasi data: user lain tidak bisa melihat/mengubah/menghapus', async () => {
      const a = await registerUser(ctx.app);
      const b = await registerUser(ctx.app);
      const t = (await as(a.token).post('/api/tasks').send({ title: 'Rahasia A' })).body;

      expect((await as(b.token).get('/api/tasks')).body.data).toHaveLength(0);
      expect((await as(b.token).get(`/api/tasks/${t.id}`)).status).toBe(404);
      expect((await as(b.token).patch(`/api/tasks/${t.id}`).send({ title: 'hack' })).status).toBe(404);
      expect((await as(b.token).delete(`/api/tasks/${t.id}`)).status).toBe(404);
      expect((await as(a.token).get(`/api/tasks/${t.id}`)).body.title).toBe('Rahasia A');
    });

    test('validasi & ID tidak valid', async () => {
      const { token } = await registerUser(ctx.app);
      expect((await as(token).post('/api/tasks').send({ title: '' })).status).toBe(400);
      expect((await as(token).get('/api/tasks/abc')).status).toBe(400);
      expect((await as(token).patch('/api/tasks/99999').send({ title: 'x' })).status).toBe(404);
    });
  });

  describe('Lampiran', () => {
    test('upload, daftar, download, dan hapus lampiran', async () => {
      const { token } = await registerUser(ctx.app);
      const t = (await as(token).post('/api/tasks').send({ title: 'Ada lampiran' })).body;
      const up = await as(token).post(`/api/tasks/${t.id}/attachments`)
        .attach('file', Buffer.from('isi catatan'), { filename: 'catatan.txt', contentType: 'text/plain' });
      expect(up.status).toBe(201);
      expect(up.body).toMatchObject({ original_name: 'catatan.txt', mime_type: 'text/plain', size_bytes: 11 });

      const detail = await as(token).get(`/api/tasks/${t.id}`);
      expect(detail.body.attachment_count).toBe(1);
      expect(detail.body.attachments[0].original_name).toBe('catatan.txt');

      const dl = await as(token).get(`/api/tasks/${t.id}/attachments/${up.body.id}/download`);
      expect(dl.status).toBe(200);
      expect(dl.headers['content-disposition']).toContain('catatan.txt');
      expect(dl.text).toBe('isi catatan');

      expect((await as(token).delete(`/api/tasks/${t.id}/attachments/${up.body.id}`)).status).toBe(204);
      expect(fs.readdirSync(ctx.config.uploadDir)).toHaveLength(0);
    });

    test('menolak tipe file berbahaya dan file terlalu besar', async () => {
      const { token } = await registerUser(ctx.app);
      const t = (await as(token).post('/api/tasks').send({ title: 'x' })).body;
      const exe = await as(token).post(`/api/tasks/${t.id}/attachments`)
        .attach('file', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
      expect(exe.status).toBe(400);
      const big = await as(token).post(`/api/tasks/${t.id}/attachments`)
        .attach('file', Buffer.alloc(1.5 * 1024 * 1024), { filename: 'besar.pdf', contentType: 'application/pdf' });
      expect(big.status).toBe(413);
    });

    test('batas jumlah lampiran per tugas & hapus tugas menghapus file', async () => {
      const { token } = await registerUser(ctx.app);
      const t = (await as(token).post('/api/tasks').send({ title: 'Banyak file' })).body;
      for (let i = 0; i < 3; i++) {
        const r = await as(token).post(`/api/tasks/${t.id}/attachments`)
          .attach('file', Buffer.from(`f${i}`), { filename: `f${i}.txt`, contentType: 'text/plain' });
        expect(r.status).toBe(201);
      }
      const fourth = await as(token).post(`/api/tasks/${t.id}/attachments`)
        .attach('file', Buffer.from('f4'), { filename: 'f4.txt', contentType: 'text/plain' });
      expect(fourth.status).toBe(400);

      const before = fs.readdirSync(ctx.config.uploadDir).length;
      await as(token).delete(`/api/tasks/${t.id}`);
      expect(fs.readdirSync(ctx.config.uploadDir).length).toBe(before - 3);
    });

    test('user lain tidak bisa mengunduh lampiran', async () => {
      const a = await registerUser(ctx.app);
      const b = await registerUser(ctx.app);
      const t = (await as(a.token).post('/api/tasks').send({ title: 'Privat' })).body;
      const up = (await as(a.token).post(`/api/tasks/${t.id}/attachments`)
        .attach('file', Buffer.from('privat'), { filename: 'p.txt', contentType: 'text/plain' })).body;
      expect((await as(b.token).get(`/api/tasks/${t.id}/attachments/${up.id}/download`)).status).toBe(404);
    });
  });

  describe('Statistik dashboard', () => {
    test('ringkasan, per prioritas, per kategori, harian, dan deadline terdekat', async () => {
      const { token } = await registerUser(ctx.app);
      const c = as(token);
      const cats = (await c.get('/api/categories')).body;
      await c.post('/api/tasks').send({ title: 'A', priority: 'high', due_date: isoDate(-1), category_id: cats[0].id });
      await c.post('/api/tasks').send({ title: 'B', priority: 'high', due_date: isoDate(0) });
      const t3 = (await c.post('/api/tasks').send({ title: 'C', priority: 'low', category_id: cats[0].id })).body;
      await c.patch(`/api/tasks/${t3.id}`).send({ status: 'done' });
      await c.post('/api/tasks').send({ title: 'D', status: 'in_progress', due_date: isoDate(30) });

      const res = await c.get('/api/stats');
      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({
        total: 4, todo: 2, in_progress: 1, done: 1, overdue: 1, due_today: 1, done_this_week: 1, completion_rate: 25,
      });
      expect(res.body.by_priority).toEqual([
        { priority: 'high', open: 2, done: 0 },
        { priority: 'medium', open: 1, done: 0 },
        { priority: 'low', open: 0, done: 1 },
      ]);
      expect(res.body.by_category.find((x) => x.name === cats[0].name)).toMatchObject({ total: 2, done: 1 });
      expect(res.body.daily).toHaveLength(14);
      expect(res.body.daily[13]).toMatchObject({ created: 4, completed: 1 });
      expect(res.body.upcoming.map((u) => u.title)).toEqual(['A', 'B']);
    });
  });
});
