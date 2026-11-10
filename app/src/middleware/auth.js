const jwt = require('jsonwebtoken');
const { HttpError } = require('../errors');

// Memeriksa header "Authorization: Bearer <token>" dan menaruh data user di req.user
function requireAuth(config) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Silakan login terlebih dahulu'));
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      req.user = { id: Number(payload.sub), name: payload.name, email: payload.email };
      next();
    } catch {
      next(new HttpError(401, 'Sesi tidak valid atau sudah kedaluwarsa, silakan login ulang'));
    }
  };
}

function signToken(user, config) {
  return jwt.sign({ sub: String(user.id), name: user.name, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

module.exports = { requireAuth, signToken };
