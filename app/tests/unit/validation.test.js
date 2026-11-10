const v = require('../../src/validation');

describe('Validasi input', () => {
  test('register valid', () => {
    const r = v.validateRegister({ name: 'Budi', email: 'BUDI@Mail.com ', password: 'rahasia123' });
    expect(r.errors).toEqual({});
    expect(r.value.email).toBe('budi@mail.com');
  });

  test('register menolak password lemah & email salah', () => {
    const r = v.validateRegister({ name: 'B', email: 'bukan-email', password: 'abcdefgh' });
    expect(Object.keys(r.errors).sort()).toEqual(['email', 'name', 'password']);
  });

  test('tugas: judul wajib, status & prioritas harus valid', () => {
    const r = v.validateTask({ title: ' ', status: 'selesai', priority: 'urgent' });
    expect(r.errors).toHaveProperty('title');
    expect(r.errors).toHaveProperty('status');
    expect(r.errors).toHaveProperty('priority');
  });

  test('tugas: tanggal harus format & nilai valid', () => {
    expect(v.validateTask({ title: 'a', due_date: '2026-02-30' }).errors).toHaveProperty('due_date');
    expect(v.validateTask({ title: 'a', due_date: '10/11/2026' }).errors).toHaveProperty('due_date');
    expect(v.validateTask({ title: 'a', due_date: '2026-11-10' }).errors).toEqual({});
    expect(v.validateTask({ title: 'a', due_date: '' }).value.due_date).toBeNull();
  });

  test('update parsial tanpa field ditolak', () => {
    expect(v.validateTask({}, { partial: true }).errors).toHaveProperty('_');
    expect(v.validateTask({ status: 'done' }, { partial: true }).errors).toEqual({});
  });

  test('query daftar tugas: default & batas limit', () => {
    const r = v.validateTaskQuery({ limit: '999', page: '-3', sort: 'drop table', order: 'ASC' });
    expect(r.value).toMatchObject({ limit: 100, page: 1, sort: 'created_at', order: 'ASC' });
    expect(v.validateTaskQuery({ due: 'kemarin' }).errors).toHaveProperty('due');
  });

  test('kategori: warna harus hex', () => {
    expect(v.validateCategory({ name: 'Kuliah', color: 'merah' }).errors).toHaveProperty('color');
    expect(v.validateCategory({ name: 'Kuliah', color: '#FF0000' }).value.color).toBe('#ff0000');
  });
});
