'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { checkAndCreateCompOffCredit } = require('../leave/compOff.service');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { notifyUser, notifyApprovers } = require('../../utils/notifications');
const { withEmployeePhoto } = require('../../utils/employeePhoto');
const { buildBusinessDateTime } = require('../../utils/dateRange');

async function listRegularizations({ companyId, brandId, employeeId, status, limit, offset }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;

  const employeeWhere = { companyId };
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

  const [attendance] = await db.Attendance.findOrCreate({
    where: { employeeId, date },
    defaults: { employeeId, date, status: 'absent' },
  });

  const regularization = await db.AttendanceRegularization.create({
    attendanceId: attendance.id,
    employeeId,
    requestedStatus,
    reason,
    status: 'pending',
    requestedCheckIn: buildBusinessDateTime(date, checkInTime),
    requestedCheckOut: buildBusinessDateTime(date, checkOutTime),
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
      ? buildBusinessDateTime(attendanceDate, checkOutTime)
      : regularization.requestedCheckOut;

  await db.sequelize.transaction(async (t) => {
    await regularization.attendance.update(
      {
        status: regularization.requestedStatus,
        ...(finalCheckIn ? { checkIn: finalCheckIn } : {}),
        ...(finalCheckOut ? { checkOut: finalCheckOut } : {}),
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
  if (regularization.requestedStatus === 'present' || regularization.requestedStatus === 'on_duty') {
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

module.exports = {
  listRegularizations,
  createRegularization,
  getRegularizationById,
  approveRegularization,
  rejectRegularization,
};
