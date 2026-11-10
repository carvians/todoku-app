class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const notFound = (msg = 'Data tidak ditemukan') => new HttpError(404, msg);

module.exports = { HttpError, badRequest, notFound };
