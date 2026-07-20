'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const redis = require('../../config/redis');
const { generateAssertionOptions, verifyDeviceAssertion } = require('../../utils/webauthn');
const { validateAndConsumeQrToken } = require('./qrTerminal.service');
const { getActiveRosterEntry } = require('./shiftRoster.service');
const { getActiveEmployeeShift } = require('./employeeShift.service');
const { checkAndCreateCompOffCredit } = require('../leave/compOff.service');

const ASSERTION_CHALLENGE_TTL_SECONDS = 120;

function assertionChallengeKey(employeeId) {
  return `webauthn:assert-challenge:${employeeId}`;
}

// Local-time YYYY-MM-DD — deliberately not toISOString() (UTC), since the
// whole point of the night-shift business-date logic below is to reason in
// the employee's calendar day, not a UTC-shifted one.
function dateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return dateOnly(d);
}

// Roster overrides the default employee_shift assignment for a specific
// date (CLAUDE.md rule 7).
async function resolveShiftForDate({ employeeId, dateStr }) {
  const roster = await getActiveRosterEntry({ employeeId, rosterDate: dateStr });
  if (roster && roster.shift) return roster.shift;

  const assignment = await getActiveEmployeeShift({ employeeId, date: dateStr });
  return assignment ? assignment.shift : null;
}

function scheduledEndDateTime(businessDate, shift) {
  if (!shift || !shift.endTime) return null;
  const [h, m, s] = shift.endTime.split(':').map(Number);
  // A night shift's end_time is on the calendar day after its start.
  const endDateStr = shift.isNightShift ? addDays(businessDate, 1) : businessDate;
  const end = new Date(`${endDateStr}T00:00:00`);
  end.setHours(h, m, s || 0, 0);
  return end;
}

// Comp-off detection is a side effect of check-in, not part of its
// contract — a bug here must never block or fail an otherwise-successful
// attendance write (attendance is the security-sensitive path with no
// fallback punch, per PHASE3_MODELS.md), so failures are logged, not thrown.
async function detectCompOffSafely({ employeeId, attendanceId, dateStr }) {
  try {
    await checkAndCreateCompOffCredit({ employeeId, attendanceId, dateStr });
  } catch (err) {
    console.error('Comp-off auto-detection failed:', err);
  }
}

async function getAssertionOptions({ employeeId }) {
  const devices = await db.EmployeeDevice.findAll({ where: { employeeId, status: 'active' } });
  if (devices.length === 0) {
    throw new HttpError(400, 'No registered device for this employee — device registration is required before check-in');
  }

  const options = await generateAssertionOptions({ allowCredentialIds: devices.map((d) => d.credentialId) });
  await redis.set(assertionChallengeKey(employeeId), options.challenge, 'EX', ASSERTION_CHALLENGE_TTL_SECONDS);
  return options;
}

// PHASE3_MODELS.md step 4, in order. Any failure throws and nothing is
// written — the employee has to file an attendance_regularization instead;
// there is intentionally no fallback punch path.
async function checkIn({ companyId, employeeId, qrToken, webauthnAssertion }) {
  if (!employeeId) throw new HttpError(400, 'No employee record linked to this user');

  const { terminal, jti } = await validateAndConsumeQrToken(qrToken);

  const expectedChallenge = await redis.get(assertionChallengeKey(employeeId));
  if (!expectedChallenge) {
    throw new HttpError(400, 'No pending WebAuthn challenge — call the assertion-options endpoint first');
  }

  const device = await db.EmployeeDevice.findOne({
    where: { employeeId, credentialId: webauthnAssertion.id, status: 'active' },
  });
  if (!device) throw new HttpError(401, 'Unrecognized or revoked device');

  const { verified, newCounter } = await verifyDeviceAssertion({
    response: webauthnAssertion,
    expectedChallenge,
    credentialId: device.credentialId,
    publicKey: device.publicKey,
  });
  if (!verified) throw new HttpError(401, 'WebAuthn assertion verification failed');

  // Signature counter must strictly increase on every use — a cloned
  // authenticator replaying an old assertion (or a genuine clone in the
  // wild) reports a counter that has already been seen or gone backwards.
  if (newCounter <= Number(device.signatureCounter)) {
    throw new HttpError(401, 'Signature counter did not advance — possible cloned or replayed authenticator');
  }

  await redis.del(assertionChallengeKey(employeeId));

  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(401, 'Employee not found for this company');
  if (terminal.companyId !== companyId) {
    throw new HttpError(403, "Terminal does not belong to the employee's company");
  }
  // A brand-scoped terminal (terminal.brandId set) only serves that brand's
  // employees. A company-level terminal (terminal.brandId null) serves every
  // employee in the company regardless of brand — this is what lets a
  // brand-optional company (or a brand-mode company's shared/common areas)
  // run QR attendance without a per-brand terminal.
  if (terminal.brandId !== null && String(terminal.brandId) !== String(employee.brandId)) {
    throw new HttpError(403, "Terminal does not belong to the employee's brand");
  }

  await device.update({ lastUsedAt: new Date(), signatureCounter: newCounter });

  const now = new Date();
  const today = dateOnly(now);
  const shift = await resolveShiftForDate({ employeeId, dateStr: today });

  // Night shift: a scan shortly after midnight closing out yesterday's
  // still-open session belongs to yesterday's attendance row, not today's.
  let businessDate = today;
  if (shift && shift.isNightShift) {
    const yesterday = addDays(today, -1);
    const openSession = await db.Attendance.findOne({
      where: { employeeId, date: yesterday, checkIn: { [Op.ne]: null }, checkOut: null },
    });
    if (openSession) businessDate = yesterday;
  }

  let attendance = await db.Attendance.findOne({ where: { employeeId, date: businessDate } });

  if (!attendance) {
    attendance = await db.Attendance.create({
      employeeId,
      date: businessDate,
      checkIn: now,
      source: 'qr',
      deviceId: device.id,
      terminalId: terminal.id,
      qrTokenJti: jti,
      status: 'present',
    });
    await detectCompOffSafely({ employeeId, attendanceId: attendance.id, dateStr: businessDate });
    return { action: 'check_in', attendance };
  }

  if (!attendance.checkIn) {
    await attendance.update({
      checkIn: now,
      source: 'qr',
      deviceId: device.id,
      terminalId: terminal.id,
      qrTokenJti: jti,
      status: 'present',
    });
    await detectCompOffSafely({ employeeId, attendanceId: attendance.id, dateStr: businessDate });
    return { action: 'check_in', attendance };
  }

  if (!attendance.checkOut) {
    const scheduledEnd = scheduledEndDateTime(businessDate, shift);
    const overtimeMinutes = scheduledEnd && now > scheduledEnd
      ? Math.round((now - scheduledEnd) / 60000)
      : 0;

    await attendance.update({ checkOut: now, overtimeMinutes });
    return { action: 'check_out', attendance };
  }

  throw new HttpError(409, 'Already checked in and out for this date');
}

async function listAttendance({ companyId, employeeId, brandId, from, to, limit, offset }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }

  const employeeWhere = { companyId };
  if (brandId) employeeWhere.brandId = brandId;

  const { rows, count } = await db.Attendance.findAndCountAll({
    where,
    limit,
    offset,
    order: [['date', 'DESC']],
    include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: ['id', 'employeeCode', 'brandId'] }],
  });
  return { rows, count };
}

// `scopedEmployeeId` is set by the route middleware when the caller only
// holds attendance:read_own — narrows the lookup so a "not mine" record
// 404s the same way a genuinely missing one would, rather than leaking
// existence via a 403.
async function getAttendanceForRead({ companyId, id, scopedEmployeeId }) {
  const where = { id };
  if (scopedEmployeeId) where.employeeId = scopedEmployeeId;

  const attendance = await db.Attendance.findOne({
    where,
    include: [{ model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'employeeCode', 'brandId'] }],
  });
  if (!attendance) throw new HttpError(404, 'Attendance record not found');
  return attendance;
}

module.exports = {
  getAssertionOptions,
  checkIn,
  listAttendance,
  getAttendanceForRead,
  resolveShiftForDate,
};
