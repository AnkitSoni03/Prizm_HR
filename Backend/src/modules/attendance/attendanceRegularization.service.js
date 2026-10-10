'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { employeeSearchWhere } = require('../../utils/employeeSearch');
const { checkAndCreateCompOffCredit } = require('../leave/compOff.service');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { notifyUser, notifyApprovers } = require('../../utils/notifications');
const { withEmployeePhoto } = require('../../utils/employeePhoto');
const { buildBusinessDateTime } = require('../../utils/dateRange');
const { resolveCheckOutDateTime } = require('../../utils/shiftTime');
const { findApprovedLeavesOnDate } = require('../leave/leaveRequest.service');

// An approved FULL-day leave (Annual, Short Leave, Unpaid...) owns the day's
// status: an employee's correction may only fix the punch times, never turn
// 'leave' into present/absent — that would leave the leave approved and its
// balance spent while the day no longer shows it. Changing the status of a
// leave day is an admin action (Attendance Records → Change Status), which
// reverts the leave and refunds the balance. A half-day leave never set the
// day's status (the employee works the other half), so it doesn't lock it.
async function findFullDayLeaveOnDate({ employeeId, date }) {
  const leaves = await findApprovedLeavesOnDate({ employeeId, date });
  return leaves.find((leave) => !leave.halfDaySession) || null;
}

async function listRegularizations({ companyId, brandId, employeeId, status, search, limit, offset }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;

  const employeeWhere = { companyId, ...employeeSearchWhere(search) };
  if (Array.isArray(brandId)) {
    if (brandId.length > 0) employeeWhere.brandId = { [Op.in]: brandId };
  } else if (brandId) {
    employeeWhere.brandId = brandId;
  }

  const { rows, count } = await db.AttendanceRegularization.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'DESC']],
    include: [
      { model: db.Employee, as: 'employee', where: employeeWhere, attributes: ['id', 'employeeCode', 'name', 'photoUrl'] },
      { model: db.Attendance, as: 'attendance' },
      {
        model: db.User,
        as: 'approverUser',
        attributes: ['id', 'email'],
        include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'name'] }],
      },
    ],
  });
  return { rows: await withEmployeePhoto(rows), count };
}

// Self-service only (attendance_regularization:request is Employee-only in
// the seeded RBAC) — employeeId is always the caller's own. If no
// attendance row exists yet for that date (e.g. the employee never scanned
// at all), one is created with status 'absent' so the regularization has
// something concrete to correct.
async function createRegularization({
  companyId,
  employeeId,
  date,
  requestedStatus,
  reason,
  checkInTime,
  checkOutTime,
}) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const fullDayLeave = await findFullDayLeaveOnDate({ employeeId, date });
  if (fullDayLeave && requestedStatus !== 'leave') {
    throw new HttpError(
      409,
      `${date} is an approved ${fullDayLeave.leaveType?.name ?? 'leave'} — you can only correct the times. Ask an admin to change the status.`
    );
  }
  if (!fullDayLeave && requestedStatus === 'leave') {
    throw new HttpError(400, 'To take leave, apply for it from My Leave');
  }

  const [attendance] = await db.Attendance.findOrCreate({
    where: { employeeId, date },
    defaults: { employeeId, date, status: 'absent' },
  });

  // A check-out time at or before the check-in (the requested one, else
  // the recorded one) is the next morning of an overnight shift.
  const requestedCheckIn = buildBusinessDateTime(date, checkInTime);
  const requestedCheckOut = resolveCheckOutDateTime(date, checkOutTime, requestedCheckIn || attendance.checkIn);

  const regularization = await db.AttendanceRegularization.create({
    attendanceId: attendance.id,
    employeeId,
    requestedStatus,
    reason,
    status: 'pending',
    requestedCheckIn,
    requestedCheckOut,
  });

  await notifyApprovers({
    companyId,
    brandId: employee.brandId,
    code: 'attendance_regularization:approve',
    excludeUserId: employee.userId,
    type: 'approval_pending',
    requestType: 'attendance_regularization',
    requestId: regularization.id,
    title: `New attendance regularization request from ${employee.name || employee.employeeCode}`,
    body: `${date}: ${requestedStatus.replace('_', ' ')}`,
  });

  return regularization;
}

async function getRegularizationForDecision({ companyId, id }) {
  const regularization = await db.AttendanceRegularization.findOne({
    where: { id },
    include: [
      { model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'userId'] },
      { model: db.Attendance, as: 'attendance' },
    ],
  });
  if (!regularization) throw new HttpError(404, 'Regularization request not found');
  if (regularization.status !== 'pending') throw new HttpError(409, 'Regularization request already decided');
  return regularization;
}

// Same lookup as getRegularizationForDecision but without the pending-only
// restriction — needed for the history endpoint, which is precisely most
// useful once a request has already been approved/rejected.
async function getRegularizationById({ companyId, id }) {
  const regularization = await db.AttendanceRegularization.findOne({
    where: { id },
    include: [{ model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'brandId'] }],
  });
  if (!regularization) throw new HttpError(404, 'Regularization request not found');
  return regularization;
}

// checkInTime/checkOutTime (optional "HH:MM" strings) let the approver
// adjust the employee's requested time before applying it — e.g. the
// employee said "10:00" but the manager knows it was actually 10:15.
// Falls back to whatever the employee originally requested
// (regularization.requestedCheckIn/Out) when the approver doesn't supply an
// override; either way, the *applied* value is written back onto the
// regularization row itself so the request's own record reflects what
// actually landed on the attendance row, not just what was first asked for.
async function approveRegularization({ companyId, id, approverId, approverUserId, checkInTime, checkOutTime }) {
  const regularization = await getRegularizationForDecision({ companyId, id });

  const attendanceDate = regularization.attendance.date;
  const finalCheckIn =
    checkInTime !== undefined ? buildBusinessDateTime(attendanceDate, checkInTime) : regularization.requestedCheckIn;
  const finalCheckOut =
    checkOutTime !== undefined
      ? resolveCheckOutDateTime(attendanceDate, checkOutTime, finalCheckIn || regularization.attendance.checkIn)
      : regularization.requestedCheckOut;

  const before = regularization.attendance;
  // Re-checked at approval time: the leave may have been approved after the
  // correction was submitted. While it stands, only the times change.
  const fullDayLeave = await findFullDayLeaveOnDate({ employeeId: regularization.employeeId, date: attendanceDate });
  const finalStatus = fullDayLeave ? 'leave' : regularization.requestedStatus === 'leave' ? before.status : regularization.requestedStatus;
  await db.sequelize.transaction(async (t) => {
    // Snapshot first — the update below overwrites these, and
    // revokeRegularization needs them back.
    const snapshot = {
      previousStatus: before.status,
      previousCheckIn: before.checkIn,
      previousCheckOut: before.checkOut,
      previousCheckoutMissed: before.checkoutMissed,
    };
    await regularization.attendance.update(
      {
        status: finalStatus,
        ...(finalCheckIn ? { checkIn: finalCheckIn } : {}),
        ...(finalCheckOut ? { checkOut: finalCheckOut, checkoutMissed: false } : {}),
      },
      { transaction: t }
    );
    await regularization.update(
      {
        status: 'approved',
        approverId: approverId || null,
        approverUserId,
        requestedCheckIn: finalCheckIn,
        requestedCheckOut: finalCheckOut,
        requestedStatus: finalStatus,
        ...snapshot,
      },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'attendance_regularization',
      requestId: regularization.id,
      action: 'approved',
      actorUserId: approverUserId,
      actorEmployeeId: approverId || null,
      transaction: t,
    });
  });

  // A regularization can also correct a day's status to present/on_duty on
  // a holiday/weekoff — same comp-off trigger as a normal check-in
  // (PHASE4_MODELS.md), run after commit and non-blocking on failure.
  if (finalStatus === 'present' || finalStatus === 'on_duty') {
    try {
      await checkAndCreateCompOffCredit({
        employeeId: regularization.employeeId,
        attendanceId: regularization.attendance.id,
        dateStr: regularization.attendance.date,
      });
    } catch (err) {
      console.error('Comp-off auto-detection failed:', err);
    }
  }

  await notifyUser({
    companyId,
    userId: regularization.employee.userId,
    type: 'approval_decision',
    requestType: 'attendance_regularization',
    requestId: regularization.id,
    title: 'Your attendance regularization was approved',
    body: regularization.attendance?.date,
  });

  return regularization;
}

async function rejectRegularization({ companyId, id, approverId, approverUserId, reason }) {
  if (!reason || !reason.trim()) throw new HttpError(400, 'A reason is required to reject a regularization request');

  const regularization = await getRegularizationForDecision({ companyId, id });

  await db.sequelize.transaction(async (t) => {
    await regularization.update(
      { status: 'rejected', approverId: approverId || null, approverUserId, rejectionReason: reason.trim() },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'attendance_regularization',
      requestId: regularization.id,
      action: 'rejected',
      actorUserId: approverUserId,
      actorEmployeeId: approverId || null,
      reason: reason.trim(),
      transaction: t,
    });
  });

  await notifyUser({
    companyId,
    userId: regularization.employee.userId,
    type: 'approval_decision',
    requestType: 'attendance_regularization',
    requestId: regularization.id,
    title: 'Your attendance regularization was rejected',
    body: reason.trim(),
  });

  return regularization;
}

function sameInstant(a, b) {
  if (!a || !b) return !a && !b;
  return new Date(a).getTime() === new Date(b).getTime();
}

// Admin-only (attendanceRegularization.routes.js::requireRevokeAccess):
// reverts an approved regularization by putting the attendance row back
// exactly as it was just before approval (the previous_* snapshot taken by
// approveRegularization). Refused when:
//   - it was approved before that snapshot existed (nothing to restore to);
//   - the attendance row has changed since (another regularization, a punch,
//     an admin correction) — restoring would silently wipe that later change;
//   - a processed/paid payroll run covers the date;
//   - a comp-off earned from the regularized day was already used for leave.
// A comp-off credit earned from the day is rejected when the restored status
// no longer counts as worked (present/on_duty). A reason is mandatory.
async function revokeRegularization({ companyId, id, actorEmployeeId, actorUserId, reason }) {
  if (!reason || !reason.trim()) throw new HttpError(400, 'A reason is required to revert a regularization');

  const regularization = await db.AttendanceRegularization.findOne({
    where: { id },
    include: [
      {
        model: db.Employee,
        as: 'employee',
        where: { companyId },
        attributes: ['id', 'userId', 'companyId', 'brandId', 'rosterGroupId'],
      },
      { model: db.Attendance, as: 'attendance' },
    ],
  });
  if (!regularization) throw new HttpError(404, 'Regularization request not found');
  if (regularization.status !== 'approved') {
    throw new HttpError(409, 'Only an approved regularization can be reverted');
  }
  if (!regularization.previousStatus) {
    throw new HttpError(
      409,
      'This regularization was approved before reverting was available — correct the day from Attendance Records instead'
    );
  }

  const attendance = regularization.attendance;
  const unchangedSinceApproval =
    attendance &&
    attendance.status === regularization.requestedStatus &&
    (!regularization.requestedCheckIn || sameInstant(attendance.checkIn, regularization.requestedCheckIn)) &&
    (!regularization.requestedCheckOut || sameInstant(attendance.checkOut, regularization.requestedCheckOut));
  if (!unchangedSinceApproval) {
    throw new HttpError(
      409,
      'This day\'s attendance has changed since the regularization was approved — correct it from Attendance Records instead'
    );
  }

  const lockedRun = await db.PayrollRun.findOne({
    where: {
      companyId: regularization.employee.companyId,
      status: { [Op.in]: ['processed', 'paid'] },
      payPeriodStart: { [Op.lte]: attendance.date },
      payPeriodEnd: { [Op.gte]: attendance.date },
    },
    attributes: ['id', 'periodMonth', 'periodYear'],
  });
  if (lockedRun) {
    throw new HttpError(
      409,
      `Payroll for ${lockedRun.periodMonth}/${lockedRun.periodYear} is already processed for this date — this regularization can no longer be reverted`
    );
  }

  const restoredWorked = regularization.previousStatus === 'present' || regularization.previousStatus === 'on_duty';
  const credit = restoredWorked
    ? null
    : await db.CompOffCredit.findOne({ where: { sourceAttendanceId: attendance.id } });
  if (credit && credit.status === 'used') {
    throw new HttpError(
      409,
      'A comp-off earned from this day has already been used for leave — revert that leave first'
    );
  }

  await db.sequelize.transaction(async (t) => {
    await attendance.update(
      {
        status: regularization.previousStatus,
        checkIn: regularization.previousCheckIn,
        checkOut: regularization.previousCheckOut,
        checkoutMissed: !!regularization.previousCheckoutMissed,
      },
      { transaction: t }
    );
    if (credit && credit.status !== 'rejected' && credit.status !== 'expired' && credit.status !== 'revoked') {
      await credit.update(
        { status: 'rejected', rejectionReason: `Regularization reverted: ${reason.trim()}` },
        { transaction: t }
      );
    }
    await regularization.update(
      { status: 'revoked', revokedAt: new Date(), revokedByUserId: actorUserId, revokeReason: reason.trim() },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'attendance_regularization',
      requestId: regularization.id,
      action: 'revoked',
      actorUserId,
      actorEmployeeId: actorEmployeeId || null,
      reason: reason.trim(),
      transaction: t,
    });
  });

  await notifyUser({
    companyId,
    userId: regularization.employee.userId,
    type: 'approval_decision',
    requestType: 'attendance_regularization',
    requestId: regularization.id,
    title: 'Your approved attendance regularization was reverted',
    body: `${attendance.date}: ${reason.trim()}`,
  });

  return regularization;
}

module.exports = {
  listRegularizations,
  revokeRegularization,
  createRegularization,
  getRegularizationById,
  approveRegularization,
  rejectRegularization,
};
