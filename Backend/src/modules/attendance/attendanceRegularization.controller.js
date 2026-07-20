'use strict';

const service = require('./attendanceRegularization.service');
const { parsePagination } = require('../../utils/pagination');
const { resolveCompanyScope, assertCompanyInCallerGroup } = require('../../utils/resolveCompanyScope');
const { listApprovalHistory } = require('../../utils/approvalHistory');
const { userHasPermission } = require('../../middleware/rbac.middleware');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId });

    const { rows, count } = await service.listRegularizations({
      companyId,
      brandId: req.regularizationBrandScope || undefined,
      employeeId: req.regularizationEmployeeScope || req.query.employeeId,
      status: req.query.status,
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { date, requestedStatus, reason } = req.body;
    if (!date || !requestedStatus || !reason) {
      return res.status(400).json({ error: 'date, requestedStatus and reason are required' });
    }
    if (!req.auth.employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    const regularization = await service.createRegularization({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      date,
      requestedStatus,
      reason,
    });
    res.status(201).json({ data: regularization });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const regularization = await service.approveRegularization({
      companyId: req.auth.companyId,
      id: req.params.id,
      approverId: req.auth.employeeId,
      approverUserId: req.auth.userId,
    });
    res.json({ data: regularization });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const regularization = await service.rejectRegularization({
      companyId: req.auth.companyId,
      id: req.params.id,
      approverId: req.auth.employeeId,
      approverUserId: req.auth.userId,
      reason: req.body.reason,
    });
    res.json({ data: regularization });
  } catch (err) {
    next(err);
  }
}

// No manager/"reports" scoping exists for regularizations (unlike leave/OD)
// — just company/brand-wide read or the caller's own record.
async function history(req, res, next) {
  try {
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId });

    const regularization = await service.getRegularizationById({ companyId, id: req.params.id });

    const allowed =
      (await userHasPermission(req.auth, 'attendance_regularization:read', regularization.employee.brandId)) ||
      (req.auth.employeeId != null &&
        String(regularization.employeeId) === String(req.auth.employeeId) &&
        (await userHasPermission(req.auth, 'attendance_regularization:read_own')));

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden', permission: 'attendance_regularization:read' });
    }

    const rows = await listApprovalHistory({
      companyId,
      requestType: 'attendance_regularization',
      requestId: req.params.id,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, approve, reject, history };
