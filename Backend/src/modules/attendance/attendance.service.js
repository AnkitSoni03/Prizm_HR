'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { getSignedDownloadUrl } = require('../../utils/gcs');
const { getActiveRosterEntry } = require('./shiftRoster.service');
const { getActiveEmployeeShift } = require('./employeeShift.service');
const { checkAndCreateCompOffCredit } = require('../leave/compOff.service');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { notifyUser } = require('../../utils/notifications');
const { createLeaveRequest, approveLeaveRequest } = require('../leave/leaveRequest.service');

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

// A full career's worth of days (~30 years) — generous since the default
// view is now "joining date to today" (a professional-HRMS convention),
// not a bounded window; this only guards against a nonsense/garbage range.
const MAX_HISTORY_RANGE_DAYS = 11000;

// ESS "My Attendance" history — unlike listAttendance (a raw table dump,
// still used by Company Admin's multi-employee attendance list), this
// synthesizes one row per calendar day in [from, to] so an employee sees
// every day in range, not just the days that happen to have an attendance
// row (holiday/weekoff/leave/absent days never get one). Rows are returned
// in full, not paginated — the whole point is "all records on this one
// page". Never shows a day before the employee's own joining date, even if
// the caller passes an earlier `from`. Shift resolution (for weekoff
// detection) is batch-fetched once up front rather than re-queried per day
// — resolveShiftForDate's own per-call roster+shift lookups would otherwise
// mean 2 DB round trips per missing day, which doesn't scale to a
// multi-year default range.
async function listMyAttendanceHistory({ companyId, employeeId, from, to }) {
  if (!from || !to) throw new HttpError(400, 'from and to are required');
  if (to < from) throw new HttpError(400, 'to cannot be before from');

  const dayCount = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;
  if (dayCount > MAX_HISTORY_RANGE_DAYS) {
    throw new HttpError(400, `Date range too large (max ${MAX_HISTORY_RANGE_DAYS} days)`);
  }

  const employee = await db.Employee.findOne({
    where: { id: employeeId, companyId },
    attributes: ['id', 'brandId', 'dateOfJoining'],
  });
  if (!employee) throw new HttpError(404, 'Employee not found');

  // Never synthesize (or return) a day before the employee actually joined.
  const startDate = employee.dateOfJoining && employee.dateOfJoining > from ? employee.dateOfJoining : from;

  const todayStr = dateOnly(new Date());
  const lastDate = to < todayStr ? to : todayStr;

  if (startDate > lastDate) return { rows: [], count: 0 };

  const [attendanceRows, holidays, leaveRequests, rosterEntries, employeeShifts] = await Promise.all([
    db.Attendance.findAll({ where: { employeeId, date: { [Op.gte]: startDate, [Op.lte]: lastDate } } }),
    db.Holiday.findAll({
      where: {
        companyId,
        date: { [Op.gte]: startDate, [Op.lte]: lastDate },
        [Op.or]: [{ brandId: null }, ...(employee.brandId ? [{ brandId: employee.brandId }] : [])],
      },
      attributes: ['date'],
    }),
    db.LeaveRequest.findAll({
      where: { employeeId, status: 'approved', fromDate: { [Op.lte]: lastDate }, toDate: { [Op.gte]: startDate } },
      attributes: ['fromDate', 'toDate'],
      include: [{ model: db.LeaveType, as: 'leaveType', attributes: ['name'] }],
    }),
    // Roster overrides the default shift for a specific date (CLAUDE.md
    // rule 7) — same precedence resolveShiftForDate uses, just batched.
    db.ShiftRoster.findAll({
      where: { employeeId, rosterDate: { [Op.gte]: startDate, [Op.lte]: lastDate }, status: 'published' },
      include: [{ model: db.Shift, as: 'shift' }],
    }),
    db.EmployeeShift.findAll({
      where: { employeeId, effectiveFrom: { [Op.lte]: lastDate } },
      order: [['effectiveFrom', 'ASC']],
      include: [{ model: db.Shift, as: 'shift' }],
    }),
  ]);

  const attendanceByDate = new Map(attendanceRows.map((a) => [a.date, a]));
  const holidaySet = new Set(holidays.map((h) => h.date));
  const rosterShiftByDate = new Map(rosterEntries.map((r) => [r.rosterDate, r.shift]));

  // Which specific leave type (e.g. "Annual Leave") covers a given date —
  // used to label 'leave' status rows instead of just the bare word
  // "leave", for both a real Attendance row (leaveRequest.service.js sets
  // status: 'leave' with no leave-type column of its own) and a
  // synthesized gap-fill row below.
  function leaveTypeNameForDate(d) {
    const match = leaveRequests.find((lr) => lr.fromDate <= d && lr.toDate >= d);
    return match?.leaveType?.name ?? null;
  }

  const rows = [];
  let shiftIdx = -1;
  for (let d = startDate; d <= lastDate; d = addDays(d, 1)) {
    const existing = attendanceByDate.get(d);
    if (existing) {
      const plain = existing.get({ plain: true });
      if (plain.status === 'leave') plain.leaveTypeName = leaveTypeNameForDate(d);
      rows.push(plain);
      continue;
    }

    while (shiftIdx + 1 < employeeShifts.length && employeeShifts[shiftIdx + 1].effectiveFrom <= d) {
      shiftIdx++;
    }
    const defaultShift = shiftIdx >= 0 ? employeeShifts[shiftIdx].shift : null;
    const shift = rosterShiftByDate.get(d) || defaultShift;
    const isWeekOff = !!shift?.weeklyOffDays?.length && shift.weeklyOffDays.includes(new Date(`${d}T00:00:00`).getDay());

    let status;
    if (holidaySet.has(d)) {
      status = 'holiday';
    } else if (leaveRequests.some((lr) => lr.fromDate <= d && lr.toDate >= d)) {
      status = 'leave';
    } else if (isWeekOff) {
      status = 'weekoff';
    } else {
      status = 'absent';
    }

    rows.push({
      id: `gap-${employeeId}-${d}`,
      employeeId,
      date: d,
      checkIn: null,
      checkOut: null,
      source: null,
      status,
      overtimeMinutes: 0,
      leaveTypeName: status === 'leave' ? leaveTypeNameForDate(d) : null,
    });
  }

  // Already ascending — the loop above walks startDate -> lastDate in order.
  return { rows, count: rows.length };
}

// Which specific leave type (e.g. "Annual Leave") covers `date` for each of
// `employeeIds` — batch version of listMyAttendanceHistory's per-employee
// leaveTypeNameForDate, used to label 'leave' rows in the roster below
// instead of the bare word "leave".
async function leaveTypeNamesForDate({ employeeIds, date }) {
  if (employeeIds.length === 0) return new Map();
  const requests = await db.LeaveRequest.findAll({
    where: {
      employeeId: { [Op.in]: employeeIds },
      status: 'approved',
      fromDate: { [Op.lte]: date },
      toDate: { [Op.gte]: date },
    },
    attributes: ['employeeId'],
    include: [{ model: db.LeaveType, as: 'leaveType', attributes: ['name'] }],
  });
  return new Map(requests.map((r) => [String(r.employeeId), r.leaveType?.name ?? null]));
}

function toRosterRow(employee, attendance, leaveTypeName) {
  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    name: employee.name,
    brandId: employee.brandId,
    attendanceId: attendance ? attendance.id : null,
    checkIn: attendance ? attendance.checkIn : null,
    checkOut: attendance ? attendance.checkOut : null,
    status: attendance ? attendance.status : 'not_marked',
    source: attendance ? attendance.source : null,
    leaveTypeName: attendance?.status === 'leave' ? leaveTypeName ?? null : null,
  };
}

// Company Admin/HR Manager/Brand Admin "Attendance Records" roster — every
// active employee in scope for `date` (paginated, 20/page), left-joined
// with their attendance row for that day if one exists ('not_marked'
// otherwise). Unlike listAttendance (a raw attendance-table dump, which
// silently omits an employee with no row at all — exactly the "forgot to
// mark attendance" case this exists to surface), this always returns one
// row per employee for the default ("All Status") view. `brandIds` is
// req.auth.scopedBrandIds: null for a company-wide caller, an array to
// restrict a Brand Admin to their own brand(s).
//
// `status`/`leaveTypeId` filter to a specific status (or, for 'leave', a
// specific leave type by id) — since only a real attendance row can match,
// a 'not_marked' employee is never returned by a filtered call, only by the
// unfiltered default below.
async function listAttendanceRoster({ companyId, brandIds, date, search, status, leaveTypeId, limit, offset }) {
  if (!date) throw new HttpError(400, 'date is required');

  const employeeWhere = { companyId, status: 'active' };
  if (brandIds) employeeWhere.brandId = { [Op.in]: brandIds };
  if (search) {
    employeeWhere[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { employeeCode: { [Op.iLike]: `%${search}%` } },
    ];
  }

  if (status) {
    const attendanceWhere = { date, status };
    let leaveTypeName = null;
    if (status === 'leave' && leaveTypeId) {
      const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId, companyId } });
      if (!leaveType) throw new HttpError(400, 'Leave type not found for this company');
      leaveTypeName = leaveType.name;

      const coveringRequests = await db.LeaveRequest.findAll({
        where: { leaveTypeId, status: 'approved', fromDate: { [Op.lte]: date }, toDate: { [Op.gte]: date } },
        attributes: ['employeeId'],
      });
      const matchingEmployeeIds = coveringRequests.map((r) => r.employeeId);
      if (matchingEmployeeIds.length === 0) return { rows: [], count: 0 };
      attendanceWhere.employeeId = { [Op.in]: matchingEmployeeIds };
    }

    const { rows: attendanceRows, count } = await db.Attendance.findAndCountAll({
      where: attendanceWhere,
      limit,
      offset,
      include: [{ model: db.Employee, as: 'employee', where: employeeWhere, attributes: ['id', 'employeeCode', 'name', 'brandId'] }],
      order: [[{ model: db.Employee, as: 'employee' }, 'name', 'ASC']],
    });

    return { rows: attendanceRows.map((a) => toRosterRow(a.employee, a, leaveTypeName)), count };
  }

  const { rows: employees, count } = await db.Employee.findAndCountAll({
    where: employeeWhere,
    limit,
    offset,
    order: [['name', 'ASC']],
    attributes: ['id', 'employeeCode', 'name', 'brandId'],
  });

  const employeeIds = employees.map((e) => e.id);
  const [attendanceRows, leaveTypeNameByEmployee] = await Promise.all([
    employeeIds.length ? db.Attendance.findAll({ where: { employeeId: { [Op.in]: employeeIds }, date } }) : [],
    leaveTypeNamesForDate({ employeeIds, date }),
  ]);
  const attendanceByEmployee = new Map(attendanceRows.map((a) => [String(a.employeeId), a]));

  const rows = employees.map((employee) =>
    toRosterRow(employee, attendanceByEmployee.get(String(employee.id)), leaveTypeNameByEmployee.get(String(employee.id)))
  );

  return { rows, count };
}

// present/half_day/absent go straight to the attendance row (below); 'leave'
// is handled separately and requires a specific leaveTypeId — an admin
// correction here stands in for a missed punch, or for filing a specific
// leave type on an employee's behalf, not a generic/untyped "on leave".
const MANUALLY_SETTABLE_STATUSES = ['present', 'half_day', 'absent', 'leave'];

// Admin bulk-correction for employees who forgot to mark their own
// attendance: sets the same status across any number of employees for one
// date in a single call.
//
// present/half_day/absent create/update the attendance row directly
// (audited via approval_histories, CLAUDE.md rule 5). 'leave' instead
// creates-and-immediately-approves a real 1-day LeaveRequest of
// `leaveTypeId` through the normal leaveRequest.service.js pipeline
// (notify: false — see that file) — reusing it rather than writing
// status: 'leave' by hand means balance consumption, eligibility, and the
// overlap check all stay correct and consistent with every other way an
// employee ends up "on leave" in this system, and it's why
// listMyAttendanceHistory/listAttendanceRoster can already show the real
// leave type name instead of a bare "leave". Each employee is processed
// independently (not one big transaction) so one employee's failure (e.g.
// insufficient balance, an existing overlapping request) doesn't block the
// rest of the batch — failures are collected and returned, not thrown.
async function bulkSetAttendanceStatus({ companyId, brandIds, employeeIds, date, status, leaveTypeId, actorUserId }) {
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    throw new HttpError(400, 'employeeIds must be a non-empty array');
  }
  if (!MANUALLY_SETTABLE_STATUSES.includes(status)) {
    throw new HttpError(400, `status must be one of: ${MANUALLY_SETTABLE_STATUSES.join(', ')}`);
  }
  if (status === 'leave' && !leaveTypeId) {
    throw new HttpError(400, 'leaveTypeId is required when status is leave');
  }
  if (!date) throw new HttpError(400, 'date is required');
  if (date > dateOnly(new Date())) {
    throw new HttpError(400, 'Cannot set attendance for a future date');
  }

  const uniqueIds = [...new Set(employeeIds.map(String))];
  const employeeWhere = { id: { [Op.in]: uniqueIds }, companyId };
  if (brandIds) employeeWhere.brandId = { [Op.in]: brandIds };

  const employees = await db.Employee.findAll({ where: employeeWhere, attributes: ['id', 'name', 'userId'] });
  if (employees.length !== uniqueIds.length) {
    throw new HttpError(400, 'One or more selected employees are not in scope');
  }

  const actor = await db.User.findOne({
    where: { id: actorUserId },
    attributes: ['id', 'email'],
    include: [{ model: db.Employee, as: 'employee', attributes: ['name'] }],
  });
  const actorName = actor?.employee?.name || actor?.email || 'An admin';

  if (status === 'leave') {
    const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId, companyId } });
    if (!leaveType) throw new HttpError(400, 'Leave type not found for this company');

    let updated = 0;
    const failures = [];
    for (const employee of employees) {
      try {
        const request = await createLeaveRequest({
          companyId,
          employeeId: employee.id,
          leaveTypeId,
          fromDate: date,
          toDate: date,
          reason: `Marked by ${actorName} via Attendance Records`,
          notify: false,
        });
        await approveLeaveRequest({
          companyId,
          id: request.id,
          approverId: null,
          approverUserId: actorUserId,
          notify: false,
        });
        updated++;
        if (employee.userId) {
          await notifyUser({
            companyId,
            userId: employee.userId,
            type: 'attendance_corrected',
            title: 'Your attendance was updated',
            body: `${date}: marked as ${leaveType.name} by ${actorName}`,
          });
        }
      } catch (err) {
        failures.push({ employeeId: employee.id, name: employee.name || null, error: err.message });
      }
    }
    return { updated, total: employees.length, failures };
  }

  const changedEmployees = [];
  await db.sequelize.transaction(async (t) => {
    for (const employee of employees) {
      const [attendance, created] = await db.Attendance.findOrCreate({
        where: { employeeId: employee.id, date },
        defaults: { employeeId: employee.id, date, status },
        transaction: t,
      });
      const isChange = created || attendance.status !== status;
      if (!created && attendance.status !== status) {
        await attendance.update({ status }, { transaction: t });
      }
      if (!isChange) continue;

      changedEmployees.push(employee);
      await recordApprovalDecision({
        companyId,
        requestType: 'attendance_correction',
        requestId: attendance.id,
        action: 'corrected',
        actorUserId,
        reason: `Marked ${status.replace('_', ' ')} for ${date}`,
        transaction: t,
      });
    }
  });

  // Best-effort, outside the transaction — same convention as every other
  // approve/reject notification in this codebase.
  for (const employee of changedEmployees) {
    if (!employee.userId) continue;
    await notifyUser({
      companyId,
      userId: employee.userId,
      type: 'attendance_corrected',
      title: 'Your attendance was updated',
      body: `${date}: marked as ${status.replace('_', ' ')} by ${actorName}`,
    });
  }

  return { updated: changedEmployees.length, total: employees.length, failures: [] };
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
  listMyAttendanceHistory,
  listAttendanceRoster,
  bulkSetAttendanceStatus,
  getAttendanceForRead,
  getAttendanceVideoUrl,
  resolveShiftForDate,
  applyAttendancePunch,
};
