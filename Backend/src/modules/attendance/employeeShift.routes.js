'use strict';

const { Router } = require('express');
const controller = require('./employeeShift.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission } = require('../../middleware/rbac.middleware');

// Mounted at /attendance/employees/:employeeId/shifts
const router = Router({ mergeParams: true });
router.use(requireAuth);

async function requireReadAccess(req, res, next) {
  try {
    if (await userHasPermission(req.auth, 'employee_shift:read')) return next();

    const canReadOwn = await userHasPermission(req.auth, 'employee_shift:read_own');
    if (canReadOwn && req.auth.employeeId != null && String(req.auth.employeeId) === String(req.params.employeeId)) {
      return next();
    }

    return res.status(403).json({ error: 'Forbidden', permission: 'employee_shift:read' });
  } catch (err) {
    next(err);
  }
}

router.get('/', requireReadAccess, controller.list);
router.post('/', requirePermission('employee_shift:create'), controller.create);
router.delete('/:id', requirePermission('employee_shift:delete'), controller.remove);

module.exports = router;
