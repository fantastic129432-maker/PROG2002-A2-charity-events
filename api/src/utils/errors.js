/**
 * src/utils/errors.js - HTTP aware error type.
 */
'use strict';

class HttpError extends Error {
  /**
   * @param {number} status  HTTP status code
   * @param {string} message human readable message returned to the client
   * @param {object} [details] extra machine readable information
   */
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details) this.details = details;
    Error.captureStackTrace(this, HttpError);
  }

  static badRequest(message = 'Invalid request', details) {
    return new HttpError(400, message, details);
  }

  static notFound(message = 'Resource not found', details) {
    return new HttpError(404, message, details);
  }

  static tooManyRequests(message = 'Too many requests', details) {
    return new HttpError(429, message, details);
  }

  static serverError(message = 'Internal server error', details) {
    return new HttpError(500, message, details);
  }
}

module.exports = { HttpError };
