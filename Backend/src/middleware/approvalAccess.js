'use strict';

const { userHasPermission, getBrandScope } = require('./rbac.middleware');
const { getGroupCompanyIds } = require('../utils/managerScope');
const { HttpError } = require('../utils/errors');

// Shared access rules for deciding / reading the history of a leave
// request, OD request or comp-off credit. Two independent ways in:
//
//   1. ADMIN — the item belongs to the caller's own company and they hold
//      the plain company/brand-wide `<resource>:<action>` code (brand-scoped
//      holders only for their own Brand(s), checked against the item's own
//      employee, never a client-supplied brandId). Their decision finalizes
//      immediately, bypassing managers who haven't voted.
//   2. MANAGER — the caller holds `<resource>:<action>_reports` AND is one of
//      THIS item's snapshotted managers (its managerApprovals rows). The
//      item may belong to ANY company of the caller's Group — a manager can
//      sit in a sibling company (see utils/managerScope.js). Their decision
//      is one vote in the all-managers-must-approve gate.
//
// `loadAnyCompany(id)` must load the item in any company with `employee`
// (companyId, brandId) and `managerApprovals` included. Sets
// `req.decision = { mode: 'admin' | 'manager', companyId, request }`, where
// companyId is the ITEM's company — the controller runs a manager's decision
// under that company's tenant context. Anything outside the caller's reach
// is a 404, never a 403, so ids from other companies don't leak existence.

function isSnapshottedManager(request, employeeId) {
  if (employeeId == null) return false;
  return (request.managerApprovals || []).some(
    (approval) => String(approval.managerEmployeeId) === String(employeeId)
  );
}

async function managerCanReach(auth, request) {
  const groupCompanyIds = await getGroupCompanyIds(auth.companyId);
  return groupCompanyIds.includes(String(request.employee.companyId));
}

// adminOnly skips the MANAGER path (e.g. reverting an approved leave).
function requireApprovalDecisionAccess({ resource, action, loadAnyCompany, notFoundMessage, adminOnly = false }) {
  return async function (req, res, next) {
    try {
      const request = await loadAnyCompany(req.params.id);
      const sameCompany = req.auth.companyId != null && String(request.employee.companyId) === String(req.auth.companyId);

      if (sameCompany) {
        const scope = await getBrandScope(req.auth, `${resource}:${action}`);
        const inScope =
          scope.allowed &&
          (scope.companyWide ||
            scope.brandIds.some((brandId) => String(brandId) === String(request.employee.brandId)));
        if (inScope) {
          req.decision = { mode: 'admin', companyId: req.auth.companyId, request };
          return next();
        }
      }

      if (
        !adminOnly &&
        isSnapshottedManager(request, req.auth.employeeId) &&
        (await userHasPermission(req.auth, `${resource}:${action}_reports`)) &&
        (await managerCanReach(req.auth, request))
      ) {
        req.decision = { mode: 'manager', companyId: request.employee.companyId, request };
        return next();
      }

      if (!sameCompany) throw new HttpError(404, notFoundMessage);
      return res.status(403).json({ error: 'Forbidden', permission: `${resource}:${action}` });
    } catch (err) {
      next(err);
    }
  };
}

// History read access for one already-loaded item (any company). Returns
// the item's companyId when allowed, else null. `scopeCompanyId` is the
// company the caller is reading as (their own, or a Group Admin's validated
// override) — admin/own-record reads only apply inside it; the manager path
// works across the Group.
async function resolveHistoryAccess({ req, request, resource, scopeCompanyId }) {
  const sameCompany = scopeCompanyId != null && String(request.employee.companyId) === String(scopeCompanyId);
  if (sameCompany) {
    if (await userHasPermission(req.auth, `${resource}:read`, request.employee.brandId)) return scopeCompanyId;
    if (
      req.auth.employeeId != null &&
      String(request.employeeId) === String(req.auth.employeeId) &&
      (await userHasPermission(req.auth, `${resource}:read_own`))
    ) {
      return scopeCompanyId;
    }
  }
  if (
    isSnapshottedManager(request, req.auth.employeeId) &&
    (await userHasPermission(req.auth, `${resource}:read_reports`)) &&
    (await managerCanReach(req.auth, request))
  ) {
    return request.employee.companyId;
  }
  return null;
}

module.exports = { requireApprovalDecisionAccess, resolveHistoryAccess };
