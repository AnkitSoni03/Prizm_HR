'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { isHoliday, isWeeklyOff } = require('../../utils/workingDays');
const { addDays } = require('../../utils/dateRange');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { notifyUser, notifyApprovers } = require('../../utils/notifications');
const { withEmployeePhoto } = require('../../utils/employeePhoto');

// Triggered from the attendance write path (Phase-3), not a user action.
// Called from every place an attendance row can be written with status
// 'present' or 'on_duty': attendance.service.js::checkIn,
// odRequest.service.js::approveOdRequest,
// attendanceRegularization.service.js::approveRegularization, and
// attendance.service.js::bulkSetAttendanceStatus. An employee with no
// compOffPolicyId (the default — comp-off is opt-in, per the Comp Off
// Setting page) earns nothing here, full stop, regardless of whether the
// day is actually a holiday/week-off.
async function checkAndCreateCompOffCredit({ employeeId, attendanceId, dateStr, transaction }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId }, transaction });
  if (!employee || !employee.compOffPolicyId) return null;

  const policy = await db.CompOffPolicy.findOne({
    where: { id: employee.compOffPolicyId, companyId: employee.companyId },
    transaction,
  });
  if (!policy) return null;

  const holiday = await isHoliday({
    companyId: employee.companyId,
    brandId: employee.brandId,
    rosterGroupId: employee.rosterGroupId,
    dateStr,
  });
  const weeklyOff = holiday ? false : await isWeeklyOff({ employeeId, dateStr });
  if (!holiday && !weeklyOff) return null;

  const existing = await db.CompOffCredit.findOne({ where: { sourceAttendanceId: attendanceId }, transaction });
  if (existing) return existing;

  const credit = await db.CompOffCredit.create(
    {
      employeeId,
      sourceAttendanceId: attendanceId,
      earnedDate: dateStr,
      status: 'pending_approval',
      // Null (never expires) for a carry-forward policy — see the migration
      // that made this column nullable and CompOffPolicy's own comment.
      expiryDate: policy.carryForward ? null : addDays(dateStr, policy.expiryDays),
    },
    { transaction }
  );

  // Every call site (attendance.service.js::detectCompOffSafely,
  // odRequest.service.js/attendanceRegularization.service.js's approve
  // functions) already calls this outside its own transaction and wraps it
  // in try/catch, so a notification failure here can't roll back the credit.
  await notifyApprovers({
    companyId: employee.companyId,
    brandId: employee.brandId,
    code: 'comp_off:approve',
    excludeUserId: employee.userId,
    type: 'approval_pending',
    requestType: 'comp_off_credit',
    requestId: credit.id,
    title: `New comp-off credit pending approval for ${employee.name || employee.employeeCode}`,
    body: `Earned ${dateStr}`,
  });

  return credit;
}

async function listCompOffCredits({ companyId, brandId, employeeId, status, limit, offset }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;

  const employeeWhere = { companyId };
  if (Array.isArray(brandId)) {
    if (brandId.length > 0) employeeWhere.brandId = { [Op.in]: brandId };
  } else if (brandId) {
    employeeWhere.brandId = brandId;
  }

  const { rows, count } = await db.CompOffCredit.findAndCountAll({
    where,
    limit,
    offset,
    order: [['earnedDate', 'DESC']],
    include: [
      { model: db.Employee, as: 'employee', where: employeeWhere, attributes: ['id', 'employeeCode', 'name', 'photoUrl'] },
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

async function getCompOffCreditForDecision({ companyId, id }) {
  const credit = await db.CompOffCredit.findOne({
    where: { id },
    include: [{ model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'userId'] }],
  });
  if (!credit) throw new HttpError(404, 'Comp-off credit not found');
  if (credit.status !== 'pending_approval') throw new HttpError(409, 'Comp-off credit already decided');
  return credit;
}

// Same lookup as getCompOffCreditForDecision but without the
// pending_approval-only restriction — needed for the history endpoint,
// which is precisely most useful once a credit has already been decided.
async function getCompOffCreditById({ companyId, id }) {
  const credit = await db.CompOffCredit.findOne({
    where: { id },
    include: [{ model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'brandId'] }],
  });
  if (!credit) throw new HttpError(404, 'Comp-off credit not found');
  return credit;
}

async function approveCompOffCredit({ companyId, id, approverId, approverUserId }) {
  const credit = await getCompOffCreditForDecision({ companyId, id });

  await db.sequelize.transaction(async (t) => {
    await credit.update(
      { status: 'approved', approverId: approverId || null, approverUserId },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'comp_off_credit',
      requestId: credit.id,
      action: 'approved',
      actorUserId: approverUserId,
      actorEmployeeId: approverId || null,
      transaction: t,
    });
  });

  await notifyUser({
    companyId,
    userId: credit.employee.userId,
    type: 'approval_decision',
    requestType: 'comp_off_credit',
    requestId: credit.id,
    title: 'Your comp-off credit was approved',
    body: `Earned ${credit.earnedDate}`,
  });

  return credit;
}

async function rejectCompOffCredit({ companyId, id, approverId, approverUserId, reason }) {
  if (!reason || !reason.trim()) throw new HttpError(400, 'A reason is required to reject a comp-off credit');

  const credit = await getCompOffCreditForDecision({ companyId, id });

  await db.sequelize.transaction(async (t) => {
    await credit.update(
      { status: 'rejected', approverId: approverId || null, approverUserId, rejectionReason: reason.trim() },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'comp_off_credit',
      requestId: credit.id,
      action: 'rejected',
      actorUserId: approverUserId,
      actorEmployeeId: approverId || null,
      reason: reason.trim(),
      transaction: t,
    });
  });

  await notifyUser({
    companyId,
    userId: credit.employee.userId,
    type: 'approval_decision',
    requestType: 'comp_off_credit',
    requestId: credit.id,
    title: 'Your comp-off credit was rejected',
    body: reason.trim(),
  });

  return credit;
}

module.exports = {
  checkAndCreateCompOffCredit,
  listCompOffCredits,
  getCompOffCreditById,
  approveCompOffCredit,
  rejectCompOffCredit,
};
