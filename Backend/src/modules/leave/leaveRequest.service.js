'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { isWorkingDay } = require('../../utils/workingDays');
const { datesBetween, addDays } = require('../../utils/dateRange');
const { getOrCreateBalance } = require('./leaveBalance.service');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { notifyUser, notifyApprovers } = require('../../utils/notifications');
const { withEmployeePhoto } = require('../../utils/employeePhoto');

function yearOf(dateStr) {
  return Number(dateStr.slice(0, 4));
}

async function listLeaveRequests({ companyId, brandId, employeeId, status, limit, offset }) {
  const where = {};
  // Array form is how a manager's "my team's requests" scope is expressed
  // (see leaveRequest.routes.js's requireReadAccess) — unlike brandId's
  // array handling below, an empty array here must still filter to zero
  // rows (a manager with no direct reports), not fall through to no filter.
  if (Array.isArray(employeeId)) {
    where.employeeId = { [Op.in]: employeeId };
  } else if (employeeId) {
    where.employeeId = employeeId;
  }
  if (status) where.status = status;

  const employeeWhere = { companyId };
  if (Array.isArray(brandId)) {
    if (brandId.length > 0) employeeWhere.brandId = { [Op.in]: brandId };
  } else if (brandId) {
    employeeWhere.brandId = brandId;
  }

  const { rows, count } = await db.LeaveRequest.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'DESC']],
    include: [
      { model: db.Employee, as: 'employee', where: employeeWhere, attributes: ['id', 'employeeCode', 'name', 'photoUrl'] },
      { model: db.LeaveType, as: 'leaveType' },
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

async function getLeaveRequestForDecision({ companyId, id }) {
  const request = await db.LeaveRequest.findOne({
    where: { id },
    include: [
      {
        model: db.Employee,
        as: 'employee',
        where: { companyId },
        attributes: ['id', 'brandId', 'managerId', 'userId'],
      },
      { model: db.LeaveType, as: 'leaveType' },
    ],
  });
  if (!request) throw new HttpError(404, 'Leave request not found');
  return request;
}

// PHASE4_MODELS.md's workflow notes, in order: compute working days, check
// balance (unless the leave type allows negative balance), check
// applicable_after_days eligibility, then create as 'pending'.
//
// Comp-off (leave_type.code === 'CO') is resolved by consuming a specific
// comp_off_credits row rather than leave_balances (see leave_requests
// migration comment) — since a single row can only link to one credit,
// comp-off requests are constrained to a single day here; taking multiple
// comp-off days means submitting multiple 1-day requests.
// `notify` defaults true for the normal employee-submits-a-request flow;
// attendance.service.js::bulkSetAttendanceStatus passes false for both this
// and approveLeaveRequest below (it creates-and-immediately-approves in one
// admin action, so a "pending request" notification to the manager would be
// stale/confusing by the time anyone saw it — the admin path sends its own
// single "who changed it" notification instead).
async function createLeaveRequest({ companyId, employeeId, leaveTypeId, fromDate, toDate, reason, notify = true }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId, companyId } });
  if (!leaveType) throw new HttpError(400, 'Leave type not found for this company');

  if (new Date(toDate) < new Date(fromDate)) {
    throw new HttpError(400, 'toDate cannot be before fromDate');
  }

  const isCompOff = leaveType.code === 'CO';
  if (isCompOff && fromDate !== toDate) {
    throw new HttpError(400, 'Comp-off requests must be a single day — submit one request per day');
  }

  const policy = await db.LeavePolicy.findOne({ where: { companyId, leaveTypeId } });
  if (policy && policy.applicableAfterDays > 0 && employee.dateOfJoining) {
    const eligibleFrom = addDays(employee.dateOfJoining, policy.applicableAfterDays);
    if (fromDate < eligibleFrom) {
      throw new HttpError(422, `Not eligible for this leave type until ${eligibleFrom}`);
    }
  }

  const candidateDates = datesBetween(fromDate, toDate);
  const workingFlags = await Promise.all(
    candidateDates.map((dateStr) => isWorkingDay({ employeeId, companyId, brandId: employee.brandId, dateStr }))
  );
  const days = workingFlags.filter(Boolean).length;
  if (days === 0) {
    throw new HttpError(422, 'No working days in the selected range');
  }

  const overlapping = await db.LeaveRequest.count({
    where: {
      employeeId,
      status: { [Op.in]: ['pending', 'approved'] },
      fromDate: { [Op.lte]: toDate },
      toDate: { [Op.gte]: fromDate },
    },
  });
  if (overlapping > 0) {
    throw new HttpError(409, 'An overlapping leave request already exists');
  }

  let compOffCreditId = null;
  if (isCompOff) {
    const credit = await db.CompOffCredit.findOne({
      where: { employeeId, status: 'approved', expiryDate: { [Op.gte]: fromDate } },
      order: [['earnedDate', 'ASC']],
    });
    if (!credit) throw new HttpError(422, 'No available comp-off credit for this employee');
    compOffCreditId = credit.id;
  } else if (!leaveType.isPaid) {
    // LWP-style: no balance sufficiency check — negative balance allowed.
  } else {
    const balance = await getOrCreateBalance({ employeeId, leaveTypeId, year: yearOf(fromDate) });
    if (Number(balance.balance) < days) {
      throw new HttpError(422, 'Insufficient leave balance');
    }
  }

  let request;
  try {
    request = await db.LeaveRequest.create({
      employeeId,
      leaveTypeId,
      fromDate,
      toDate,
      days,
      reason: reason || null,
      status: 'pending',
      compOffCreditId,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'That comp-off credit was just claimed by another request');
    }
    throw err;
  }

  if (notify) {
    const employeeLabel = employee.name || employee.employeeCode;
    if (employee.managerId) {
      const manager = await db.Employee.findByPk(employee.managerId, { attributes: ['userId'] });
      await notifyUser({
        companyId,
        userId: manager?.userId,
        type: 'approval_pending',
        requestType: 'leave_request',
        requestId: request.id,
        title: `New leave request from ${employeeLabel}`,
        body: `${fromDate} → ${toDate}`,
      });
    }
    await notifyApprovers({
      companyId,
      brandId: employee.brandId,
      code: 'leave_request:approve',
      excludeUserId: employee.userId,
      type: 'approval_pending',
      requestType: 'leave_request',
      requestId: request.id,
      title: `New leave request from ${employeeLabel}`,
      body: `${fromDate} → ${toDate}`,
    });
  }

  return request;
}

// On approval: decrement leave_balances (or flip the linked comp-off credit
// to 'used'), then write attendance rows with status='leave' for the
// *working* days in the range only — a holiday/weekoff inside the range was
// never counted in `days` (see createLeaveRequest), so it must not be
// overwritten with a 'leave' status either. Mirrors
// od_request.service.js::approveOdRequest's findOrCreate-per-date pattern.
async function approveLeaveRequest({ companyId, id, approverId, approverUserId, notify = true }) {
  const request = await getLeaveRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'Leave request already decided');

  await db.sequelize.transaction(async (t) => {
    await request.update(
      { status: 'approved', approverId: approverId || null, approverUserId },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'leave_request',
      requestId: request.id,
      action: 'approved',
      actorUserId: approverUserId,
      actorEmployeeId: approverId || null,
      transaction: t,
    });

    if (request.compOffCreditId) {
      const credit = await db.CompOffCredit.findOne({ where: { id: request.compOffCreditId }, transaction: t });
      if (!credit || credit.status !== 'approved') {
        throw new HttpError(409, 'Linked comp-off credit is no longer approved/available');
      }
      await credit.update({ status: 'used' }, { transaction: t });
    } else {
      // Usage is tracked in leave_balances even for unpaid (LWP-style)
      // types — only the insufficient-balance rejection at request-creation
      // time is skipped for those; approval still records the consumption,
      // which is allowed to push balance negative.
      const balance = await getOrCreateBalance({
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year: yearOf(request.fromDate),
        transaction: t,
      });
      const used = Number(balance.used) + Number(request.days);
      await balance.update({ used, balance: Number(balance.allotted) - used }, { transaction: t });
    }

    for (const date of datesBetween(request.fromDate, request.toDate)) {
      const working = await isWorkingDay({
        employeeId: request.employeeId,
        companyId,
        brandId: request.employee.brandId,
        dateStr: date,
      });
      if (!working) continue;

      const [attendance] = await db.Attendance.findOrCreate({
        where: { employeeId: request.employeeId, date },
        defaults: { employeeId: request.employeeId, date, status: 'leave' },
        transaction: t,
      });
      if (attendance.status !== 'leave') {
        await attendance.update({ status: 'leave' }, { transaction: t });
      }
    }
  });

  if (notify) {
    await notifyUser({
      companyId,
      userId: request.employee.userId,
      type: 'approval_decision',
      requestType: 'leave_request',
      requestId: request.id,
      title: 'Your leave request was approved',
      body: `${request.fromDate} → ${request.toDate}`,
    });
  }

  return request;
}

async function rejectLeaveRequest({ companyId, id, approverId, approverUserId, reason }) {
  if (!reason || !reason.trim()) throw new HttpError(400, 'A reason is required to reject a leave request');

  const request = await getLeaveRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'Leave request already decided');

  await db.sequelize.transaction(async (t) => {
    await request.update(
      { status: 'rejected', approverId: approverId || null, approverUserId, rejectionReason: reason.trim() },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'leave_request',
      requestId: request.id,
      action: 'rejected',
      actorUserId: approverUserId,
      actorEmployeeId: approverId || null,
      reason: reason.trim(),
      transaction: t,
    });
  });

  await notifyUser({
    companyId,
    userId: request.employee.userId,
    type: 'approval_decision',
    requestType: 'leave_request',
    requestId: request.id,
    title: 'Your leave request was rejected',
    body: reason.trim(),
  });

  return request;
}

async function cancelLeaveRequest({ companyId, employeeId, id }) {
  const request = await db.LeaveRequest.findOne({ where: { id, employeeId } });
  if (!request) throw new HttpError(404, 'Leave request not found');
  if (request.status !== 'pending') throw new HttpError(409, 'Only a pending leave request can be cancelled');

  await request.update({ status: 'cancelled' });

  const employee = await db.Employee.findByPk(employeeId, {
    attributes: ['id', 'name', 'employeeCode', 'brandId', 'managerId', 'userId'],
  });
  const employeeLabel = employee?.name || employee?.employeeCode || 'An employee';
  if (employee?.managerId) {
    const manager = await db.Employee.findByPk(employee.managerId, { attributes: ['userId'] });
    await notifyUser({
      companyId,
      userId: manager?.userId,
      type: 'request_cancelled',
      requestType: 'leave_request',
      requestId: request.id,
      title: `${employeeLabel} cancelled their leave request`,
      body: `${request.fromDate} → ${request.toDate}`,
    });
  }
  await notifyApprovers({
    companyId,
    brandId: employee?.brandId,
    code: 'leave_request:approve',
    excludeUserId: employee?.userId,
    type: 'request_cancelled',
    requestType: 'leave_request',
    requestId: request.id,
    title: `${employeeLabel} cancelled their leave request`,
    body: `${request.fromDate} → ${request.toDate}`,
  });

  return request;
}

module.exports = {
  listLeaveRequests,
  getLeaveRequestForDecision,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
};
