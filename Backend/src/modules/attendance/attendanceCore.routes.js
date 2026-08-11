'use strict';

const { Router } = require('express');
const controller = require('./attendance.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { userHasPermission, requirePermission } = require('../../middleware/rbac.middleware');

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

router.get('/', requireReadAccess, controller.list);
// Uses the safer requirePermission (req.auth.scopedBrandIds) rather than
// requireReadAccess above — that one grants attendance:read_own callers
// (plain Employees) through with attendanceEmployeeScope, which the
// roster/bulk-status admin endpoints below have no concept of and would
// wrongly treat as "unrestricted company-wide" if reused here.
router.get('/roster', requirePermission('attendance:read'), controller.roster);
router.get('/board', requirePermission('attendance:read'), controller.board);
router.get('/board/export', requirePermission('attendance:read'), controller.exportBoard);
router.patch('/bulk-status', requirePermission('attendance:update'), controller.bulkUpdateStatus);
router.get('/:id', requireReadAccess, controller.get);
router.get('/:id/video-url', requireReadAccess, controller.videoUrl);

module.exports = router;
