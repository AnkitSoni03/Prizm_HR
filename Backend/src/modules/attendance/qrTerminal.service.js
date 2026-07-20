'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { generateTerminalSecret, signQrToken, peekTerminalId, verifyQrToken } = require('../../utils/qrToken');
const redis = require('../../config/redis');

const MIN_ROTATION_SECONDS = 5;
const MAX_ROTATION_SECONDS = 10;

async function listTerminals({ limit, offset }) {
  // Relies on QrAttendanceTerminal's tenant-scope hook for company_id filtering.
  const { rows, count } = await db.QrAttendanceTerminal.findAndCountAll({
    limit,
    offset,
    order: [['id', 'ASC']],
    attributes: { exclude: ['secretKey'] },
  });
  return { rows, count };
}

async function getTerminalForRead(id) {
  const terminal = await db.QrAttendanceTerminal.findOne({
    where: { id },
    attributes: { exclude: ['secretKey'] },
  });
  if (!terminal) throw new HttpError(404, 'Terminal not found');
  return terminal;
}

// brandId is optional: a company-level terminal (brandId null) serves every
// employee in the company regardless of brand — see the check in
// attendance.service.js::checkIn.
async function createTerminal({ companyId, brandId, terminalCode, rotationSeconds }) {
  if (brandId) {
    const brand = await db.Brand.findOne({ where: { id: brandId, companyId } });
    if (!brand) throw new HttpError(400, 'Brand not found for this company');
  }

  const seconds = rotationSeconds || 8;
  if (seconds < MIN_ROTATION_SECONDS || seconds > MAX_ROTATION_SECONDS) {
    throw new HttpError(400, `rotationSeconds must be between ${MIN_ROTATION_SECONDS} and ${MAX_ROTATION_SECONDS}`);
  }

  const secretKey = generateTerminalSecret();

  try {
    const terminal = await db.QrAttendanceTerminal.create({
      companyId,
      brandId: brandId || null,
      terminalCode,
      secretKey,
      rotationSeconds: seconds,
      status: 'active',
    });

    // Only revealed once, at creation — configure the physical terminal
    // with this value now, it is never returned by list/get again.
    const plain = terminal.toJSON();
    plain.secretKey = secretKey;
    return plain;
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'terminalCode already in use for this company');
    }
    throw err;
  }
}

// Called by the physical terminal device itself (not a logged-in user), so
// it authenticates with the terminal's own secret_key rather than a JWT —
// see PHASE3_MODELS.md step 2. Any company/tenant context here is derived
// from the terminal row, not from requireAuth (there is none).
async function rotateQrToken({ terminalCode, presentedSecret }) {
  const terminal = await db.QrAttendanceTerminal.findOne({ where: { terminalCode } });
  if (!terminal || terminal.status !== 'active' || terminal.secretKey !== presentedSecret) {
    throw new HttpError(401, 'Invalid terminal credentials');
  }

  const { token, jti, expiresAt } = signQrToken({
    terminalId: terminal.id,
    secretKey: terminal.secretKey,
    rotationSeconds: terminal.rotationSeconds,
  });

  return { qrToken: token, jti, expiresAt };
}

// Shared with the attendance check-in flow: validate signature+exp, then
// enforce the Redis replay guard (SET jti EX rotation_seconds NX). Any
// failure here means no attendance write happens — the caller is
// responsible for turning that into a regularization prompt, not a retry.
async function validateAndConsumeQrToken(qrToken) {
  const terminalId = peekTerminalId(qrToken);
  if (!terminalId) throw new HttpError(401, 'Invalid QR token');

  const terminal = await db.QrAttendanceTerminal.findByPk(terminalId);
  if (!terminal || terminal.status !== 'active') throw new HttpError(401, 'Invalid QR token');

  let payload;
  try {
    payload = verifyQrToken(qrToken, terminal.secretKey);
  } catch (err) {
    throw new HttpError(401, 'QR token is invalid or expired');
  }

  const replayKey = `attendance:jti:${payload.jti}`;
  const acquired = await redis.set(replayKey, '1', 'EX', terminal.rotationSeconds, 'NX');
  if (!acquired) {
    throw new HttpError(409, 'QR token has already been used');
  }

  return { terminal, jti: payload.jti };
}

module.exports = {
  listTerminals,
  getTerminalForRead,
  createTerminal,
  rotateQrToken,
  validateAndConsumeQrToken,
};
