'use strict';

const service = require('./odRequest.service');
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

    const { rows, count } = await service.listOdRequests({
      companyId,
      brandId: req.odRequestBrandScope || undefined,
      employeeId: req.odRequestEmployeeScope || req.query.employeeId,
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
    const { fromDate, toDate, purpose, location } = req.body;
    if (!fromDate || !toDate || !purpose) {
      return res.status(400).json({ error: 'fromDate, toDate and purpose are required' });
    }
    if (!req.auth.employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    const request = await service.createOdRequest({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      fromDate,
      toDate,
      purpose,
      location,
    });
    res.status(201).json({ data: request });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const request = await service.approveOdRequest({
      companyId: req.auth.companyId,
      id: req.params.id,
      approverId: req.auth.employeeId,
      approverUserId: req.auth.userId,
    });
    res.json({ data: request });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const request = await service.rejectOdRequest({
      companyId: req.auth.companyId,
      id: req.params.id,
      approverId: req.auth.employeeId,
      approverUserId: req.auth.userId,
      reason: req.body.reason,
    });
    res.json({ data: request });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const request = await service.cancelOdRequest({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      id: req.params.id,
    });
    res.json({ data: request });
  } catch (err) {
    next(err);
  }
}

// Mirrors leaveRequest.controller.js's history — same three access paths
// (company/brand-wide read, own record, or manager of the request's
// employee), checked against the real record rather than trusted params.
async function history(req, res, next) {
  try {
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId });

    const request = await service.getOdRequestForDecision({ companyId, id: req.params.id });

    const allowed =
      (await userHasPermission(req.auth, 'od_request:read', request.employee.brandId)) ||
      (req.auth.employeeId != null &&
        String(request.employeeId) === String(req.auth.employeeId) &&
        (await userHasPermission(req.auth, 'od_request:read_own'))) ||
      (req.auth.employeeId != null &&
        String(request.employee.managerId) === String(req.auth.employeeId) &&
        (await userHasPermission(req.auth, 'od_request:read_reports')));

    if (!allowed) return res.status(403).json({ error: 'Forbidden', permission: 'od_request:read' });

    const rows = await listApprovalHistory({ companyId, requestType: 'od_request', requestId: req.params.id });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, approve, reject, cancel, history };
