'use strict';

const service = require('./leaveRequest.service');
const { parsePagination } = require('../../utils/pagination');
const { resolveCompanyScope, assertCompanyInCallerGroup } = require('../../utils/resolveCompanyScope');
const { listApprovalHistory } = require('../../utils/approvalHistory');
const { resolveHistoryAccess } = require('../../middleware/approvalAccess');
const { runAsCompany } = require('../../config/tenant-context');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId });

    const { rows, count } = await service.listLeaveRequests({
      // A manager's reports may span the Group — their ids already bound it.
      companyId: req.leaveRequestCrossCompany ? null : companyId,
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
    const { leaveTypeId, fromDate, toDate, reason, halfDaySession } = req.body;
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
      halfDaySession,
    });
    res.status(201).json({ data: request });
  } catch (err) {
    next(err);
  }
}

// req.decision (requireDecisionAccess): an admin's approve/reject bypasses
// every manager immediately; a manager's is one vote in the AND-gate
// (decideLeaveRequestAsManager only finalizes once every other manager has
// also approved, or immediately on any single reject) and runs as the
// REQUEST's company — the manager may be in a sibling company of the Group.
function decide(req, decision) {
  const { mode, companyId } = req.decision;
  if (mode === 'manager') {
    return runAsCompany(companyId, () =>
      service.decideLeaveRequestAsManager({
        companyId,
        id: req.params.id,
        managerEmployeeId: req.auth.employeeId,
        approverUserId: req.auth.userId,
        decision,
        reason: req.body.reason,
      })
    );
  }
  const args = { companyId, id: req.params.id, approverId: req.auth.employeeId, approverUserId: req.auth.userId };
  return decision === 'approved'
    ? service.approveLeaveRequest(args)
    : service.rejectLeaveRequest({ ...args, reason: req.body.reason });
}

async function approve(req, res, next) {
  try {
    res.json({ data: await decide(req, 'approved') });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    res.json({ data: await decide(req, 'rejected') });
  } catch (err) {
    next(err);
  }
}

// Admin-only (see the route) � reverts an approved request; reason required.
async function revoke(req, res, next) {
  try {
    const request = await service.revokeLeaveRequest({
      companyId: req.decision.companyId,
      id: req.params.id,
      actorEmployeeId: req.auth.employeeId,
      actorUserId: req.auth.userId,
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

// Company/brand-wide read, own record, or one of the request's snapshotted
// managers (any company of the Group) — checked against the real record.
async function history(req, res, next) {
  try {
    const scopeCompanyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId: scopeCompanyId });

    const request = await service.getLeaveRequestForDecision({ companyId: null, id: req.params.id });
    const companyId = await resolveHistoryAccess({ req, request, resource: 'leave_request', scopeCompanyId });
    if (!companyId) return res.status(404).json({ error: 'Leave request not found' });

    // ApprovalHistory is tenant-scoped — read it as the request's company.
    const rows = await runAsCompany(companyId, () =>
      listApprovalHistory({ companyId, requestType: 'leave_request', requestId: req.params.id })
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, approve, reject, revoke, cancel, history };
