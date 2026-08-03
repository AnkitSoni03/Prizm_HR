'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { getSignedDownloadUrl } = require('../../utils/gcs');
const { getActiveRosterEntry } = require('./shiftRoster.service');
const { getActiveEmployeeShift } = require('./employeeShift.service');
const { checkAndCreateCompOffCredit } = require('../leave/compOff.service');

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

// The one function every check-in mechanism (old QR-terminal, old
// office-kiosk WebAuthn, and now face recognition) shares — they diverge
// only in how the punch gets authorized, not in what happens once it's
// authorized. Wrapped in a transaction with a Postgres advisory lock on the
// employee id so a double-tap/retry landing on two different API instances
// can't create two records.
async function applyAttendancePunch({ employeeId, now, source, kioskUserId = null }) {
  return db.sequelize.transaction(async (t) => {
    await db.sequelize.query('SELECT pg_advisory_xact_lock(:employeeId)', {
      replacements: { employeeId },
      transaction: t,
    });

    const today = dateOnly(now);
    const shift = await resolveShiftForDate({ employeeId, dateStr: today });

    // Night shift: a scan shortly after midnight closing out yesterday's
    // still-open session belongs to yesterday's attendance row, not today's.
    let businessDate = today;
    if (shift && shift.isNightShift) {
      const yesterday = addDays(today, -1);
      const openSession = await db.Attendance.findOne({
        where: { employeeId, date: yesterday, checkIn: { [Op.ne]: null }, checkOut: null },
        transaction: t,
      });
      if (openSession) businessDate = yesterday;
    }

    let attendance = await db.Attendance.findOne({ where: { employeeId, date: businessDate }, transaction: t });

    if (!attendance) {
      attendance = await db.Attendance.create(
        { employeeId, date: businessDate, checkIn: now, source, kioskUserId, status: 'present' },
        { transaction: t }
      );
      await detectCompOffSafely({ employeeId, attendanceId: attendance.id, dateStr: businessDate });
      return { action: 'check_in', attendance };
    }

    if (!attendance.checkIn) {
      await attendance.update(
        { checkIn: now, source, kioskUserId, status: 'present' },
        { transaction: t }
      );
      await detectCompOffSafely({ employeeId, attendanceId: attendance.id, dateStr: businessDate });
      return { action: 'check_in', attendance };
    }

    if (!attendance.checkOut) {
      const scheduledEnd = scheduledEndDateTime(businessDate, shift);
      const overtimeMinutes = scheduledEnd && now > scheduledEnd
        ? Math.round((now - scheduledEnd) / 60000)
        : 0;

      await attendance.update({ checkOut: now, overtimeMinutes }, { transaction: t });
      return { action: 'check_out', attendance };
    }

    throw new HttpError(409, 'Already checked in and out for this date');
  });
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
    include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: ['id', 'employeeCode', 'name', 'brandId'] }],
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

// Signed URL is generated fresh on every call, never persisted — same
// pattern as companyPolicy.service.js's document downloads.
async function getAttendanceVideoUrl({ companyId, id, scopedEmployeeId, type }) {
  if (type !== 'checkin' && type !== 'checkout') {
    throw new HttpError(400, "type must be 'checkin' or 'checkout'");
  }
  const attendance = await getAttendanceForRead({ companyId, id, scopedEmployeeId });
  const objectPath = type === 'checkin' ? attendance.videoObjectPathCheckin : attendance.videoObjectPathCheckout;
  if (!objectPath) throw new HttpError(404, 'No video recorded for this attendance record');

  const url = await getSignedDownloadUrl(objectPath);
  return { url };
}

module.exports = {
  listAttendance,
  getAttendanceForRead,
  getAttendanceVideoUrl,
  resolveShiftForDate,
  applyAttendancePunch,
};
