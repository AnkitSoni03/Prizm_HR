'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { checkAndCreateCompOffCredit } = require('../leave/compOff.service');
const { datesBetween } = require('../../utils/dateRange');
const { recordApprovalDecision } = require('../../utils/approvalHistory');
const { notifyUser, notifyApprovers } = require('../../utils/notifications');
const { withEmployeePhoto } = require('../../utils/employeePhoto');

async function listOdRequests({ companyId, brandId, employeeId, status, limit, offset }) {
  const where = {};
  // Array form is a manager's "my team's requests" scope (see
  // odRequest.routes.js's requireReadAccess) — an empty array must still
  // filter to zero rows (a manager with no direct reports), unlike
  // brandId's array handling below.
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

  const { rows, count } = await db.OdRequest.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'DESC']],
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

async function createOdRequest({ companyId, employeeId, fromDate, toDate, purpose, location }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (new Date(toDate) < new Date(fromDate)) {
    throw new HttpError(400, 'toDate cannot be before fromDate');
  }

  const request = await db.OdRequest.create({ employeeId, fromDate, toDate, purpose, location, status: 'pending' });

  const employeeLabel = employee.name || employee.employeeCode;
  if (employee.managerId) {
    const manager = await db.Employee.findByPk(employee.managerId, { attributes: ['userId'] });
    await notifyUser({
      companyId,
      userId: manager?.userId,
      type: 'approval_pending',
      requestType: 'od_request',
      requestId: request.id,
      title: `New OD request from ${employeeLabel}`,
      body: `${fromDate} → ${toDate}`,
    });
  }
  await notifyApprovers({
    companyId,
    brandId: employee.brandId,
    code: 'od_request:approve',
    excludeUserId: employee.userId,
    type: 'approval_pending',
    requestType: 'od_request',
    requestId: request.id,
    title: `New OD request from ${employeeLabel}`,
    body: `${fromDate} → ${toDate}`,
  });

  return request;
}

async function getOdRequestForDecision({ companyId, id }) {
  const request = await db.OdRequest.findOne({
    where: { id },
    include: [
      {
        model: db.Employee,
        as: 'employee',
        where: { companyId },
        attributes: ['id', 'brandId', 'managerId', 'userId'],
      },
    ],
  });
  if (!request) throw new HttpError(404, 'OD request not found');
  return request;
}

// Approval marks attendance without a QR scan (PHASE3_MODELS.md) — one
// attendance row per day in the OD range, status 'on_duty', source 'od'.
async function approveOdRequest({ companyId, id, approverId, approverUserId }) {
  const request = await getOdRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'OD request already decided');

  const writtenAttendance = [];

  await db.sequelize.transaction(async (t) => {
    await request.update(
      { status: 'approved', approverId: approverId || null, approverUserId },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'od_request',
      requestId: request.id,
      action: 'approved',
      actorUserId: approverUserId,
      actorEmployeeId: approverId || null,
      transaction: t,
    });

    for (const date of datesBetween(request.fromDate, request.toDate)) {
      const [attendance] = await db.Attendance.findOrCreate({
        where: { employeeId: request.employeeId, date },
        defaults: { employeeId: request.employeeId, date, status: 'on_duty', source: 'od' },
        transaction: t,
      });
      if (attendance.status !== 'on_duty') {
        await attendance.update({ status: 'on_duty', source: 'od' }, { transaction: t });
      }
      writtenAttendance.push({ attendanceId: attendance.id, dateStr: date });
    }
  });

  // Comp-off detection runs after commit, same non-blocking-on-failure
  // rationale as attendance.service.js's detectCompOffSafely.
  for (const { attendanceId, dateStr } of writtenAttendance) {
    try {
      await checkAndCreateCompOffCredit({ employeeId: request.employeeId, attendanceId, dateStr });
    } catch (err) {
      console.error('Comp-off auto-detection failed:', err);
    }
  }

  await notifyUser({
    companyId,
    userId: request.employee.userId,
    type: 'approval_decision',
    requestType: 'od_request',
    requestId: request.id,
    title: 'Your OD request was approved',
    body: `${request.fromDate} → ${request.toDate}`,
  });

  return request;
}

async function rejectOdRequest({ companyId, id, approverId, approverUserId, reason }) {
  if (!reason || !reason.trim()) throw new HttpError(400, 'A reason is required to reject an OD request');

  const request = await getOdRequestForDecision({ companyId, id });
  if (request.status !== 'pending') throw new HttpError(409, 'OD request already decided');

  await db.sequelize.transaction(async (t) => {
    await request.update(
      { status: 'rejected', approverId: approverId || null, approverUserId, rejectionReason: reason.trim() },
      { transaction: t }
    );
    await recordApprovalDecision({
      companyId,
      requestType: 'od_request',
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
    requestType: 'od_request',
    requestId: request.id,
    title: 'Your OD request was rejected',
    body: reason.trim(),
  });

  return request;
}

async function cancelOdRequest({ companyId, employeeId, id }) {
  const request = await db.OdRequest.findOne({ where: { id, employeeId } });
  if (!request) throw new HttpError(404, 'OD request not found');
  if (request.status !== 'pending') throw new HttpError(409, 'Only a pending OD request can be cancelled');

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
      requestType: 'od_request',
      requestId: request.id,
      title: `${employeeLabel} cancelled their OD request`,
      body: `${request.fromDate} → ${request.toDate}`,
    });
  }
  await notifyApprovers({
    companyId,
    brandId: employee?.brandId,
    code: 'od_request:approve',
    excludeUserId: employee?.userId,
    type: 'request_cancelled',
    requestType: 'od_request',
    requestId: request.id,
    title: `${employeeLabel} cancelled their OD request`,
    body: `${request.fromDate} → ${request.toDate}`,
  });

  return request;
}

module.exports = {
  listOdRequests,
  getOdRequestForDecision,
  createOdRequest,
  approveOdRequest,
  rejectOdRequest,
  cancelOdRequest,
};
