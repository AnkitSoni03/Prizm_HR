'use strict';

const { Router } = require('express');
const controller = require('./resignation.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission, getBrandScope } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

// Company/brand view — resignation:read (Company Admin / Brand Admin / HR
// Manager). Brand scope derived from the caller's own grants.
async function requireCompanyReadAccess(req, res, next) {
  try {
    if (!req.auth.companyId) return res.status(403).json({ error: 'Forbidden', permission: 'resignation:read' });
    const scope = await getBrandScope(req.auth, 'resignation:read');
    if (!scope.allowed) return res.status(403).json({ error: 'Forbidden', permission: 'resignation:read' });
    req.resignationBrandScope = scope.companyWide ? null : scope.brandIds;
    next();
  } catch (err) {
    next(err);
  }
}

// ESS Team view — the assigned-HR part needs decide_assigned, the manager
// part read_reports. Either one is enough to open the list.
async function requireTeamReadAccess(req, res, next) {
  try {
    const [canDecide, canReadReports] = await Promise.all([
      userHasPermission(req.auth, 'resignation:decide_assigned'),
      userHasPermission(req.auth, 'resignation:read_reports'),
    ]);
    if (!canDecide && !canReadReports) {
      return res.status(403).json({ error: 'Forbidden', permission: 'resignation:read_reports' });
    }
    req.canReadReports = canReadReports;
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/mine', requirePermission('resignation:read_own'), controller.listMine);
router.post('/', requirePermission('resignation:submit_own'), controller.submit);
router.patch('/:id/withdraw', requirePermission('resignation:submit_own'), controller.withdraw);
router.get('/team', requireTeamReadAccess, controller.listTeam);
router.get('/', requireCompanyReadAccess, controller.listCompany);
// Only the employee's assigned HR — checked per resignation in the service.
router.patch('/:id/decision', requirePermission('resignation:decide_assigned'), controller.decide);

module.exports = router;
