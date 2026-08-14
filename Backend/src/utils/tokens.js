'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

// Stateless refresh token: a signed JWT carrying the user's id and the
// tokenVersion (users.token_version) it was issued under, instead of an
// opaque handle looked up in a session table. Validity = signature +
// expiry (checked by jwt.verify) + tokenVersion still matching the user's
// current value (checked by the caller, auth.service.js::refresh) — that
// second check is what lets a password reset invalidate every outstanding
// refresh token at once without a per-token DB row to revoke. Signed with
// a distinct type claim + (when set) its own secret so a leaked/misused
// access token can never be replayed as a refresh token or vice versa.
function signRefreshToken({ userId, tokenVersion }) {
  return jwt.sign(
    { sub: userId, tokenVersion, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` }
  );
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
  if (payload.type !== 'refresh') {
    throw new Error('Not a refresh token');
  }
  return payload;
}

// Opaque (non-JWT) tokens for invitation links and password resets: only a
// hash is stored, so a stolen DB row alone can't be replayed as a token.
function generateOpaqueToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateOpaqueToken,
  hashToken,
  daysFromNow,
  minutesFromNow,
};
