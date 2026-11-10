// Dipanggil oleh HEALTHCHECK Dockerfile. Memakai Node (bukan wget/curl)
// agar tidak perlu menambah paket ke image.
const http = require('http');

const req = http.get({ host: '127.0.0.1', port: process.env.PORT || 3000, path: '/api/health', timeout: 3000 }, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.on('timeout', () => { req.destroy(); process.exit(1); });
