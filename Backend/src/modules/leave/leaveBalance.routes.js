'use strict';

const { Router } = require('express');
const controller = require('./leaveBalance.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

async function requireReadAccess(req, res, next) {
  try {
    // An Employee who ALSO holds the company-wide code through a power
    // (e.g. "Assign Leaves" / "Attendance Records & Board") must still see
    // only their OWN data on their ESS pages, which call this without an
    // employeeId — so own-scope wins unless a specific employee is asked
    // for. Admin pages always pass employeeId (or use other endpoints), and
    // admins never hold *_read_own, so they're unaffected.
    if (
      req.query.employeeId === undefined &&
      req.auth.employeeId != null &&
      (await userHasPermission(req.auth, 'leave_balance:read_own'))
    ) {
      req.leaveBalanceEmployeeScope = req.auth.employeeId;
      return next();
    }
    if (await userHasPermission(req.auth, 'leave_balance:read')) {
      req.leaveBalanceEmployeeScope = null;
      return next();
    }
    if (await userHasPermission(req.auth, 'leave_balance:read_own') && req.auth.employeeId != null) {
      req.leaveBalanceEmployeeScope = req.auth.employeeId;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden', permission: 'leave_balance:read' });
  } catch (err) {
    next(err);
  }
}

router.get('/', requireReadAccess, controller.list);
router.post('/adjust', requirePermission('leave_balance:adjust'), controller.adjust);
router.post('/bulk-adjust', requirePermission('leave_balance:adjust'), controller.bulkAdjust);

module.exports = router;
