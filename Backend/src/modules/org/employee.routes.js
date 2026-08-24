'use strict';

const { Router } = require('express');
const controller = require('./employee.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission } = require('../../middleware/rbac.middleware');
const { upload } = require('../../middleware/upload.middleware');
const employeeDocumentRoutes = require('./employeeDocument.routes');
const documentUploadRequestRoutes = require('./documentUploadRequest.routes');

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

// Self-service photo routes, defined before '/:id/photo' so 'me' is never
// swallowed by the :id param — no permission code (mirrors auth's own
// change-password: managing your own profile photo isn't a resource-scoped
// RBAC action).
router.post('/me/photo', upload.single('photo'), controller.uploadMyPhoto);
router.delete('/me/photo', controller.removeMyPhoto);

router.get('/', requirePermission('employee:read'), controller.list);
router.get('/:id', requireEmployeeReadAccess, controller.get);
router.post('/', requirePermission('employee:create'), controller.create);
router.patch('/:id', requirePermission('employee:update'), controller.update);
// Dedicated Roster-change action (carry-forward decision) — same
// employee:update gate as the generic PATCH.
router.patch('/:id/roster', requirePermission('employee:update'), controller.changeRoster);
router.post('/:id/roster/renew', requirePermission('employee:update'), controller.renewRoster);
router.get('/:id/roster-transfer-history', requirePermission('employee:update'), controller.getRosterTransferHistory);
// Gated by the same employee:update permission every admin who can already
// edit an employee already holds — no separate gate permission, per the
// user's explicit "all admins have right to assign that power".
router.put('/:id/powers', requirePermission('employee:update'), controller.assignPowers);
router.patch('/:id/transfer', requirePermission('employee:transfer'), controller.transfer);
// Gated by the same employee:update permission as the generic PATCH — no
// separate gate permission, matching the powers/photo precedent above.
router.patch('/:id/active', requirePermission('employee:update'), controller.setActive);
router.post('/:id/photo', requirePermission('employee:update'), upload.single('photo'), controller.uploadPhoto);
router.delete('/:id/photo', requirePermission('employee:update'), controller.removePhoto);
router.delete('/:id', requirePermission('employee:delete'), controller.remove);

router.use('/:employeeId/documents', employeeDocumentRoutes);
router.use('/:employeeId/document-requests', documentUploadRequestRoutes);

module.exports = router;
