'use strict';

class HttpError extends Error {
  // code is optional — a short machine-readable tag (e.g.
  // 'ACCOUNT_DEACTIVATED') for the rare cases where the frontend needs to
  // react differently to a specific error rather than just displaying
  // `message`. Most call sites never set it.
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = { HttpError };
