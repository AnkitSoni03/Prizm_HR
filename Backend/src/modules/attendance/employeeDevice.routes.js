'use strict';

const { Router } = require('express');
const controller = require('./employeeDevice.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission } = require('../../middleware/rbac.middleware');

// Mounted at /attendance/employees/:employeeId/devices
const router = Router({ mergeParams: true });
router.use(requireAuth);

// Registration is inherently self-service-or-assisted: an employee
// registers their own device, or an HR/Admin with employee_device:register
// can register on someone's behalf (e.g. onboarding).
async function requireDeviceWriteAccess(req, res, next) {
  try {
    if (await userHasPermission(req.auth, 'employee_device:register')) return next();

    if (req.auth.employeeId != null && String(req.auth.employeeId) === String(req.params.employeeId)) {
      return next();
    }

    return res.status(403).json({ error: 'Forbidden', permission: 'employee_device:register' });
  } catch (err) {
    next(err);
  }
}

router.get('/', requireDeviceWriteAccess, controller.list);
router.post('/registration-options', requireDeviceWriteAccess, controller.registrationOptions);
router.post('/', requireDeviceWriteAccess, controller.register);
router.patch('/:id/revoke', requirePermission('employee_device:revoke'), controller.revoke);

module.exports = router;
