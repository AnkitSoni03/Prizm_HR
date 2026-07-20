'use strict';

const { Router } = require('express');
const controller = require('./employeeDocument.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission } = require('../../middleware/rbac.middleware');

const router = Router({ mergeParams: true });
router.use(requireAuth);

// employee_document:read (any) OR employee_document:read_own limited to the
// caller's own linked employee record.
async function requireDocumentReadAccess(req, res, next) {
  try {
    if (await userHasPermission(req.auth, 'employee_document:read')) return next();

    const canReadOwn = await userHasPermission(req.auth, 'employee_document:read_own');
    if (
      canReadOwn &&
      req.auth.employeeId != null &&
      String(req.auth.employeeId) === String(req.params.employeeId)
    ) {
      return next();
    }

    return res.status(403).json({ error: 'Forbidden', permission: 'employee_document:read' });
  } catch (err) {
    next(err);
  }
}

router.get('/', requireDocumentReadAccess, controller.list);
router.get('/:id', requireDocumentReadAccess, controller.get);
router.post('/', requirePermission('employee_document:upload'), controller.upload);
router.patch('/:id/verify', requirePermission('employee_document:verify'), controller.verify);

module.exports = router;
