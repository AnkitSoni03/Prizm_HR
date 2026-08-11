'use strict';

const crypto = require('crypto');

// AES-256-GCM: authenticated encryption (decrypt fails loudly if the
// ciphertext was tampered with or the key is wrong), random 12-byte IV per
// call so encrypting the same password twice never produces the same
// ciphertext. KIOSK_PASSWORD_ENCRYPTION_KEY is a 32-byte key, base64-encoded
// in .env — same "secret lives only in .env, never committed" convention as
// JWT_SECRET (src/utils/tokens.js).
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const raw = process.env.KIOSK_PASSWORD_ENCRYPTION_KEY;
  if (!raw) throw new Error('KIOSK_PASSWORD_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('KIOSK_PASSWORD_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  return key;
}

// Encrypts a kiosk account's plaintext password so it can be shown again
// later on request (see officeKiosk.service.js) — a deliberate, explicitly
// requested exception to this app's usual "every credential is one-way
// bcrypt-hashed, never recoverable" rule, only ever used for Scanner/kiosk
// machine accounts, never for a real person's login password.
function encryptKioskPassword(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptKioskPassword(payload) {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encryptKioskPassword, decryptKioskPassword };
