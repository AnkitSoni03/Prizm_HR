'use strict';

const service = require('./leaveRequest.service');
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

    const { rows, count } = await service.listLeaveRequests({
      companyId,
      brandId: req.leaveRequestBrandScope || undefined,
      employeeId: req.leaveRequestEmployeeScope || req.query.employeeId,
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
    const { leaveTypeId, fromDate, toDate, reason } = req.body;
    if (!leaveTypeId || !fromDate || !toDate) {
      return res.status(400).json({ error: 'leaveTypeId, fromDate and toDate are required' });
    }
    if (!req.auth.employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    const request = await service.createLeaveRequest({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      leaveTypeId,
      fromDate,
      toDate,
      reason,
    });
    res.status(201).json({ data: request });
  } catch (err) {
    next(err);
  }
}

// req.leaveDecisionMode ('admin' | 'manager') was set by requireDecisionAccess
// based on WHICH grant actually let this caller through — an admin's
// approve/reject bypasses every manager immediately; a manager's is one vote
// in the AND-gate (decideLeaveRequestAsManager only finalizes once every
// other manager has also approved, or immediately on any single reject).
async function approve(req, res, next) {
  try {
    const request =
      req.leaveDecisionMode === 'manager'
        ? await service.decideLeaveRequestAsManager({
            companyId: req.auth.companyId,
            id: req.params.id,
            managerEmployeeId: req.auth.employeeId,
            approverUserId: req.auth.userId,
            decision: 'approved',
          })
        : await service.approveLeaveRequest({
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
    const request =
      req.leaveDecisionMode === 'manager'
        ? await service.decideLeaveRequestAsManager({
            companyId: req.auth.companyId,
            id: req.params.id,
            managerEmployeeId: req.auth.employeeId,
            approverUserId: req.auth.userId,
            decision: 'rejected',
            reason: req.body.reason,
          })
        : await service.rejectLeaveRequest({
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
    const request = await service.cancelLeaveRequest({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      id: req.params.id,
    });
    res.json({ data: request });
  } catch (err) {
    next(err);
  }
}

// Same three access paths as requireDecisionAccess (company/brand-wide read,
// own record, or manager of the request's employee) — checked against the
// real record rather than trusted scope params, since this is a single-id
// lookup, not a list.
async function history(req, res, next) {
  try {
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId });

    const request = await service.getLeaveRequestForDecision({ companyId, id: req.params.id });

    const isSnapshottedManager =
      req.auth.employeeId != null &&
      request.managerApprovals.some((approval) => String(approval.managerEmployeeId) === String(req.auth.employeeId));

    const allowed =
      (await userHasPermission(req.auth, 'leave_request:read', request.employee.brandId)) ||
      (req.auth.employeeId != null &&
        String(request.employeeId) === String(req.auth.employeeId) &&
        (await userHasPermission(req.auth, 'leave_request:read_own'))) ||
      (isSnapshottedManager && (await userHasPermission(req.auth, 'leave_request:read_reports')));

    if (!allowed) return res.status(403).json({ error: 'Forbidden', permission: 'leave_request:read' });

    const rows = await listApprovalHistory({ companyId, requestType: 'leave_request', requestId: req.params.id });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, approve, reject, cancel, history };
