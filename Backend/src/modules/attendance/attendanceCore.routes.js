'use strict';

const { Router } = require('express');
const controller = require('./attendance.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

async function requireReadAccess(req, res, next) {
  try {
    if (await userHasPermission(req.auth, 'attendance:read')) {
      req.attendanceEmployeeScope = null;
      return next();
    }
    if (await userHasPermission(req.auth, 'attendance:read_own') && req.auth.employeeId != null) {
      req.attendanceEmployeeScope = req.auth.employeeId;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden', permission: 'attendance:read' });
  } catch (err) {
    next(err);
  }
}

router.post('/checkin/assertion-options', requirePermission('attendance:mark'), controller.assertionOptions);
router.post('/checkin', requirePermission('attendance:mark'), controller.checkIn);
router.get('/', requireReadAccess, controller.list);
router.get('/:id', requireReadAccess, controller.get);
router.get('/:id/video-url', requireReadAccess, controller.videoUrl);

module.exports = router;
