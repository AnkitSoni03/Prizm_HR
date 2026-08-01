'use strict';

const { Router } = require('express');
const controller = require('./documentUploadRequest.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission } = require('../../middleware/rbac.middleware');

const router = Router({ mergeParams: true });
router.use(requireAuth);

// Same shape as employeeDocument.routes.js's requireDocumentReadAccess —
// employee_document:read (any) OR employee_document:read_own limited to the
// caller's own linked employee record, so an Employee sees their own
// pending requests on My Profile without needing a broader grant.
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

// Same shape as employeeDocument.routes.js's requireDocumentUploadAccess —
// employee_document:upload (any) OR employee_document:upload_own limited to
// the caller's own linked employee record, so an Employee can mark their
// own request "Done" without needing a broader grant.
async function requireOwnCompleteAccess(req, res, next) {
  try {
    if (await userHasPermission(req.auth, 'employee_document:upload')) return next();

    const canUploadOwn = await userHasPermission(req.auth, 'employee_document:upload_own');
    if (
      canUploadOwn &&
      req.auth.employeeId != null &&
      String(req.auth.employeeId) === String(req.params.employeeId)
    ) {
      return next();
    }

    return res.status(403).json({ error: 'Forbidden', permission: 'employee_document:upload' });
  } catch (err) {
    next(err);
  }
}

router.get('/', requireDocumentReadAccess, controller.list);
// Creating/cancelling a request is gated on employee_document:verify — the
// same permission an admin (or an Employee holding the "Document
// Verification" power) already needs to review documents, per the explicit
// ask that request-creation follow that same grant.
router.post('/', requirePermission('employee_document:verify'), controller.create);
router.patch('/:id/cancel', requirePermission('employee_document:verify'), controller.cancel);
router.patch('/:id/done', requireOwnCompleteAccess, controller.complete);

module.exports = router;
