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

// Opaque (non-JWT) tokens for refresh tokens and invitation links: only a
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

function refreshTokenExpiry() {
  return daysFromNow(REFRESH_TOKEN_TTL_DAYS);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateOpaqueToken,
  hashToken,
  daysFromNow,
  minutesFromNow,
  refreshTokenExpiry,
};
