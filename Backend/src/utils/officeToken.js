'use strict';

const crypto = require('crypto');

// Opaque random token for the office kiosk QR — unlike qrToken.js's
// terminal-signed JWT, validity here is a live Redis lookup (SET ... EX),
// not a signature check, since the kiosk is an authenticated User account,
// not a device with its own signing secret.
function generateOfficeToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Single-purpose ticket for the SSE handshake (EventSource can't send an
// Authorization header). Deliberately separate from the kiosk's real JWT so
// a leaked query-string log line only exposes a 30-second, one-time value.
function generateSseTicket() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = { generateOfficeToken, generateSseTicket };
