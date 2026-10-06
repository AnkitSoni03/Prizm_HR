'use strict';

const { Router } = require('express');
const controller = require('./compOff.controller');
const service = require('./compOff.service');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission, getBrandScope } = require('../../middleware/rbac.middleware');
const { requireApprovalDecisionAccess } = require('../../middleware/approvalAccess');
const { getManagedEmployeeIds } = require('../../utils/managerScope');

const router = Router();
router.use(requireAuth);

// getBrandScope (not a raw client-supplied brandId) decides the caller's
// real read scope — omitting brandId from the query used to fall through to
// company-wide access for a Brand Admin who only holds a brand-scoped
// comp_off:read grant.
//
// `?scope=reports` is the Team Approvals page's explicit opt-in: credits of
// every employee who has the caller as primary OR additional manager, in
// any company of the caller's Group (same as leave/OD). Never the default.
async function requireReadAccess(req, res, next) {
  try {
    if (req.query.scope === 'reports') {
      if ((await userHasPermission(req.auth, 'comp_off:read_reports')) && req.auth.employeeId != null) {
        req.compOffEmployeeScope = await getManagedEmployeeIds({
          companyId: req.auth.companyId,
          managerEmployeeId: req.auth.employeeId,
        });
        req.compOffCrossCompany = true;
        return next();
      }
      return res.status(403).json({ error: 'Forbidden', permission: 'comp_off:read_reports' });
    }

    // Own credits by default for an Employee (My Comp-Off), even if a power
    // also gives them company-wide comp_off:read — the broader view is an
    // explicit ?scope=company (Team Approvals). Admins never hold
    // comp_off:read_own, so their plain list call is unaffected.
    if (
      req.query.scope !== 'company' &&
      req.query.employeeId === undefined &&
      req.auth.employeeId != null &&
      (await userHasPermission(req.auth, 'comp_off:read_own'))
    ) {
      req.compOffEmployeeScope = req.auth.employeeId;
      return next();
    }

    const scope = await getBrandScope(req.auth, 'comp_off:read');
    if (scope.allowed) {
      const requestedBrandId = req.query.brandId || null;
      if (
        !scope.companyWide &&
        requestedBrandId &&
        !scope.brandIds.some((brandId) => String(brandId) === String(requestedBrandId))
      ) {
        return res.status(403).json({ error: 'Forbidden', permission: 'comp_off:read' });
      }
      req.compOffEmployeeScope = null;
      req.compOffBrandScope = scope.companyWide ? requestedBrandId : scope.brandIds;
      return next();
    }
    if (await userHasPermission(req.auth, 'comp_off:read_own') && req.auth.employeeId != null) {
      req.compOffEmployeeScope = req.auth.employeeId;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden', permission: 'comp_off:read' });
  } catch (err) {
    next(err);
  }
}

// Admin (company/brand-wide comp_off:approve|reject — finalizes at once) or
// one of THIS credit's snapshotted managers (comp_off:*_reports — one vote;
// every manager must approve). See middleware/approvalAccess.js.
function requireDecisionAccess(action, { adminOnly = false } = {}) {
  return requireApprovalDecisionAccess({
    resource: 'comp_off',
    action,
    adminOnly,
    loadAnyCompany: (id) => service.getCompOffCreditById({ companyId: null, id }),
    notFoundMessage: 'Comp-off credit not found',
  });
}

router.get('/', requireReadAccess, controller.list);
router.post('/', requirePermission('comp_off:credit'), controller.create);
router.get('/:id/history', controller.history);
router.patch('/:id/approve', requireDecisionAccess('approve'), controller.approve);
router.patch('/:id/reject', requireDecisionAccess('reject'), controller.reject);
// Reverting an approved credit is an admin power only — managers can't undo
// a finalized decision (same as leave/OD).
router.patch('/:id/revoke', requireDecisionAccess('approve', { adminOnly: true }), controller.revoke);

module.exports = router;
