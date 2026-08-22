'use strict';

const service = require('./compOff.service');
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

    const { rows, count } = await service.listCompOffCredits({
      companyId,
      brandId: req.compOffBrandScope || undefined,
      employeeId: req.compOffEmployeeScope || req.query.employeeId,
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
    const credit = await service.createCompOffCredit({
      companyId: req.auth.companyId,
      employeeId: req.body.employeeId,
      earnedDate: req.body.earnedDate,
      expiryDate: req.body.expiryDate || null,
      reason: req.body.reason,
      actorUserId: req.auth.userId,
      actorEmployeeId: req.auth.employeeId,
    });
    res.status(201).json({ data: credit });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const credit = await service.approveCompOffCredit({
      companyId: req.auth.companyId,
      id: req.params.id,
      approverId: req.auth.employeeId,
      approverUserId: req.auth.userId,
    });
    res.json({ data: credit });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const credit = await service.rejectCompOffCredit({
      companyId: req.auth.companyId,
      id: req.params.id,
      approverId: req.auth.employeeId,
      approverUserId: req.auth.userId,
      reason: req.body.reason,
    });
    res.json({ data: credit });
  } catch (err) {
    next(err);
  }
}

// No manager/"reports" scoping exists for comp-off credits (unlike
// leave/OD) — just company/brand-wide read or the caller's own record.
async function history(req, res, next) {
  try {
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId });

    const credit = await service.getCompOffCreditById({ companyId, id: req.params.id });

    const allowed =
      (await userHasPermission(req.auth, 'comp_off:read', credit.employee.brandId)) ||
      (req.auth.employeeId != null &&
        String(credit.employeeId) === String(req.auth.employeeId) &&
        (await userHasPermission(req.auth, 'comp_off:read_own')));

    if (!allowed) return res.status(403).json({ error: 'Forbidden', permission: 'comp_off:read' });

    const rows = await listApprovalHistory({ companyId, requestType: 'comp_off_credit', requestId: req.params.id });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, approve, reject, history };
