'use strict';

const { Router } = require('express');
const controller = require('./compOff.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission, getBrandScope } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

// getBrandScope (not a raw client-supplied brandId) decides the caller's
// real read scope — omitting brandId from the query used to fall through to
// company-wide access for a Brand Admin who only holds a brand-scoped
// comp_off:read grant.
async function requireReadAccess(req, res, next) {
  try {
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

router.get('/', requireReadAccess, controller.list);
router.post('/', requirePermission('comp_off:credit'), controller.create);
router.get('/:id/history', controller.history);
router.patch('/:id/approve', requirePermission('comp_off:approve'), controller.approve);
router.patch('/:id/reject', requirePermission('comp_off:reject'), controller.reject);

module.exports = router;
