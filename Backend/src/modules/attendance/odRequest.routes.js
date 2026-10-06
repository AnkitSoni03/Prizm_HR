'use strict';

const { Router } = require('express');
const controller = require('./odRequest.controller');
const service = require('./odRequest.service');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission, getBrandScope } = require('../../middleware/rbac.middleware');
const { getManagedEmployeeIds } = require('../../utils/managerScope');
const { requireApprovalDecisionAccess } = require('../../middleware/approvalAccess');

const router = Router();
router.use(requireAuth);

// getBrandScope (not a raw client-supplied brandId) decides the caller's
// real read scope — omitting brandId from the query used to fall through to
// company-wide access for a Brand Admin who only holds a brand-scoped
// od_request:read grant. See rbac.middleware.js's requirePermission for the
// same fix applied to the generic single-permission-code routes.
//
// `?scope=reports` and `?scope=company` are explicit opt-ins the Team
// Approvals page sends — neither is ever the default for a plain
// `GET /attendance/od-requests` call. This matters now that an Employee can
// hold company-wide od_request:read via the "Approve Leave/OD Requests"
// power (see powerCatalog.js) in *addition* to their base role's read_own:
// the default (no scope param) case below checks read_own first and
// returns early when held, so MyOdPage.tsx (no scope param) always sees
// only that caller's own requests, never silently upgraded to the
// company-wide view. `?scope=company` is how Team Approvals' company-wide
// tab deliberately asks for that broader view instead. Mirrors
// leaveRequest.routes.js's requireReadAccess exactly.
async function requireReadAccess(req, res, next) {
  try {
    const requestedScope = req.query.scope;

    if (requestedScope === 'reports') {
      if (await userHasPermission(req.auth, 'od_request:read_reports') && req.auth.employeeId != null) {
        // Every employee who has the caller as primary OR additional
        // manager, in any company of the caller's Group — so the list itself
        // is not pinned to the caller's company (odRequestCrossCompany).
        req.odRequestEmployeeScope = await getManagedEmployeeIds({
          companyId: req.auth.companyId,
          managerEmployeeId: req.auth.employeeId,
        });
        req.odRequestCrossCompany = true;
        return next();
      }
      return res.status(403).json({ error: 'Forbidden', permission: 'od_request:read_reports' });
    }

    if (
      requestedScope !== 'company' &&
      (await userHasPermission(req.auth, 'od_request:read_own')) &&
      req.auth.employeeId != null
    ) {
      req.odRequestEmployeeScope = req.auth.employeeId;
      return next();
    }

    const scope = await getBrandScope(req.auth, 'od_request:read');
    if (scope.allowed) {
      const requestedBrandId = req.query.brandId || null;
      if (
        !scope.companyWide &&
        requestedBrandId &&
        !scope.brandIds.some((brandId) => String(brandId) === String(requestedBrandId))
      ) {
        return res.status(403).json({ error: 'Forbidden', permission: 'od_request:read' });
      }
      req.odRequestEmployeeScope = null;
      req.odRequestBrandScope = scope.companyWide ? requestedBrandId : scope.brandIds;
      return next();
    }

    return res.status(403).json({ error: 'Forbidden', permission: 'od_request:read' });
  } catch (err) {
    next(err);
  }
}

// Admin (company/brand-wide od_request:approve|reject — finalizes at once)
// or one of THIS request's snapshotted managers (od_request:*_reports — one
// vote; every manager must approve). See middleware/approvalAccess.js.
function requireDecisionAccess(action, { adminOnly = false } = {}) {
  return requireApprovalDecisionAccess({
    resource: 'od_request',
    action,
    adminOnly,
    loadAnyCompany: (id) => service.getOdRequestForDecision({ companyId: null, id }),
    notFoundMessage: 'OD request not found',
  });
}

router.get('/', requireReadAccess, controller.list);
router.post('/', requirePermission('od_request:create'), controller.create);
router.get('/:id/history', controller.history);
router.patch('/:id/approve', requireDecisionAccess('approve'), controller.approve);
router.patch('/:id/reject', requireDecisionAccess('reject'), controller.reject);
// Reverting an approved OD is an admin power only — managers can't undo a
// finalized request (same as leave).
router.patch('/:id/revoke', requireDecisionAccess('approve', { adminOnly: true }), controller.revoke);
router.patch('/:id/cancel', requirePermission('od_request:create'), controller.cancel);

module.exports = router;
