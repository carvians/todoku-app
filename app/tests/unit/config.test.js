const { loadConfig } = require('../../src/config');

describe('Konfigurasi dari environment variable', () => {
  test('nilai default untuk development', () => {
    const c = loadConfig({});
    expect(c.port).toBe(3000);
    expect(c.env).toBe('development');
    expect(c.jwtSecret).toBeTruthy();
  });

  test('produksi wajib JWT_SECRET minimal 32 karakter', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) })).not.toThrow();
  });

  test('APP_VERSION dari pipeline dipakai sebagai versi', () => {
    expect(loadConfig({ APP_VERSION: '2.0.0-abc123' }).version).toBe('2.0.0-abc123');
  });
});
