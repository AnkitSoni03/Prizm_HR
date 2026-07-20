'use strict';

const { Router } = require('express');
const controller = require('./employee.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission } = require('../../middleware/rbac.middleware');
const employeeDocumentRoutes = require('./employeeDocument.routes');

const router = Router();
router.use(requireAuth);

// employee:read (any employee) OR employee:read_own limited to the caller's
// own linked employee record (req.auth.employeeId, set from the JWT).
async function requireEmployeeReadAccess(req, res, next) {
  try {
    if (await userHasPermission(req.auth, 'employee:read')) return next();

    const canReadOwn = await userHasPermission(req.auth, 'employee:read_own');
    if (canReadOwn && req.auth.employeeId != null && String(req.auth.employeeId) === String(req.params.id)) {
      return next();
    }

    return res.status(403).json({ error: 'Forbidden', permission: 'employee:read' });
  } catch (err) {
    next(err);
  }
}

router.get('/', requirePermission('employee:read'), controller.list);
router.get('/:id', requireEmployeeReadAccess, controller.get);
router.post('/', requirePermission('employee:create'), controller.create);
router.patch('/:id', requirePermission('employee:update'), controller.update);
// Gated by the same employee:update permission every admin who can already
// edit an employee already holds — no separate gate permission, per the
// user's explicit "all admins have right to assign that power".
router.put('/:id/powers', requirePermission('employee:update'), controller.assignPowers);
router.patch('/:id/transfer', requirePermission('employee:transfer'), controller.transfer);
router.delete('/:id', requirePermission('employee:delete'), controller.remove);

router.use('/:employeeId/documents', employeeDocumentRoutes);

module.exports = router;
