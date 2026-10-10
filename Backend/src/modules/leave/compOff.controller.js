'use strict';

const service = require('./compOff.service');
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

    const { rows, count } = await service.listCompOffCredits({
      // A manager's reports may span the Group — their ids already bound it.
      companyId: req.compOffCrossCompany ? null : companyId,
      brandId: req.compOffBrandScope || undefined,
      employeeId: req.compOffEmployeeScope || req.query.employeeId,
      status: req.query.status,
      search: req.query.search,
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
    const credit = await service.createCompOffCredit({
      companyId: req.auth.companyId,
      employeeId: req.body.employeeId,
      earnedDate: req.body.earnedDate,
      expiryDate: req.body.expiryDate || null,
      reason: req.body.reason,
      actorUserId: req.auth.userId,
      actorEmployeeId: req.auth.employeeId,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.status(201).json({ data: credit });
  } catch (err) {
    next(err);
  }
}

// req.decision (requireDecisionAccess): an admin's decision finalizes at
// once; a manager's is one vote, run as the CREDIT's company (the manager
// may be in a sibling company of the Group).
function decide(req, decision) {
  const { mode, companyId } = req.decision;
  if (mode === 'manager') {
    return runAsCompany(companyId, () =>
      service.decideCompOffCreditAsManager({
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
    ? service.approveCompOffCredit(args)
    : service.rejectCompOffCredit({ ...args, reason: req.body.reason });
}

async function approve(req, res, next) {
  try {
    res.json({ data: await decide(req, 'approved') });
  } catch (err) {
    next(err);
  }
}

// Admin-only (see the route) — reverts an approved credit; reason required.
async function revoke(req, res, next) {
  try {
    const credit = await service.revokeCompOffCredit({
      companyId: req.decision.companyId,
      id: req.params.id,
      actorEmployeeId: req.auth.employeeId,
      actorUserId: req.auth.userId,
      reason: req.body.reason,
    });
    res.json({ data: credit });
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

// Company/brand-wide read, own record, or one of the credit's snapshotted
// managers (any company of the Group) — checked against the real record.
async function history(req, res, next) {
  try {
    const scopeCompanyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId: scopeCompanyId });

    const credit = await service.getCompOffCreditById({ companyId: null, id: req.params.id });
    const companyId = await resolveHistoryAccess({ req, request: credit, resource: 'comp_off', scopeCompanyId });
    if (!companyId) return res.status(404).json({ error: 'Comp-off credit not found' });

    // ApprovalHistory is tenant-scoped — read it as the credit's company.
    const rows = await runAsCompany(companyId, () =>
      listApprovalHistory({ companyId, requestType: 'comp_off_credit', requestId: req.params.id })
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, approve, reject, revoke, history };
