'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const redis = require('../../config/redis');
const {
  generateDeviceRegistrationOptions,
  verifyDeviceRegistration,
} = require('../../utils/webauthn');

const CHALLENGE_TTL_SECONDS = 300;

function challengeKey(employeeId) {
  return `webauthn:reg-challenge:${employeeId}`;
}

async function getRegistrationOptions({ companyId, employeeId }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const existingDevices = await db.EmployeeDevice.findAll({
    where: { employeeId, status: 'active' },
    attributes: ['credentialId'],
  });

  const options = await generateDeviceRegistrationOptions({
    employeeId,
    employeeCode: employee.employeeCode,
    excludeCredentialIds: existingDevices.map((d) => d.credentialId),
  });

  await redis.set(challengeKey(employeeId), options.challenge, 'EX', CHALLENGE_TTL_SECONDS);
  return options;
}

// No device registered => no check-in possible; there is intentionally no
// fallback punch method (PHASE3_MODELS.md).
async function registerDevice({ companyId, employeeId, deviceFingerprint, registrationResponse }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const expectedChallenge = await redis.get(challengeKey(employeeId));
  if (!expectedChallenge) throw new HttpError(400, 'Registration challenge expired or not found; request a new one');

  const verified = await verifyDeviceRegistration({ response: registrationResponse, expectedChallenge });
  if (!verified) throw new HttpError(400, 'WebAuthn registration verification failed');

  await redis.del(challengeKey(employeeId));

  try {
    return await db.EmployeeDevice.create({
      employeeId,
      deviceFingerprint,
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      signatureCounter: verified.counter,
      registeredAt: new Date(),
      status: 'active',
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'This passkey is already registered');
    }
    throw err;
  }
}

async function listDevices({ companyId, employeeId }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  return db.EmployeeDevice.findAll({
    where: { employeeId },
    attributes: { exclude: ['publicKey'] },
    order: [['id', 'ASC']],
  });
}

async function revokeDevice({ companyId, employeeId, id }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const device = await db.EmployeeDevice.findOne({ where: { id, employeeId } });
  if (!device) throw new HttpError(404, 'Device not found');

  await device.update({ status: 'revoked' });
  return device;
}

module.exports = { getRegistrationOptions, registerDevice, listDevices, revokeDevice };
