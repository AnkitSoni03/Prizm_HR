'use strict';

const { Router } = require('express');
const controller = require('./leaveBalance.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

async function requireReadAccess(req, res, next) {
  try {
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
