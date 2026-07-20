'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function generateTerminalSecret() {
  return crypto.randomBytes(32).toString('hex');
}

// { terminalId, jti, iat, exp } signed with the terminal's own secret_key
// (PHASE3_MODELS.md step 2) — a fresh jti each rotation is what the Redis
// replay guard keys off of.
function signQrToken({ terminalId, secretKey, rotationSeconds }) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ terminalId, jti }, secretKey, { expiresIn: rotationSeconds });
  return { token, jti, expiresAt: new Date(Date.now() + rotationSeconds * 1000) };
}

// Peek the terminalId without verifying the signature yet — the signing
// secret lives on the terminal row, which we can only look up once we know
// which terminal signed the token.
function peekTerminalId(token) {
  const decoded = jwt.decode(token);
  return decoded && decoded.terminalId;
}

function verifyQrToken(token, secretKey) {
  return jwt.verify(token, secretKey);
}

module.exports = { generateTerminalSecret, signQrToken, peekTerminalId, verifyQrToken };
