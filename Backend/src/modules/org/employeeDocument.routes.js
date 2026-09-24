'use strict';

const { Router } = require('express');
const controller = require('./employeeDocument.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { userHasPermission, getBrandScope } = require('../../middleware/rbac.middleware');
const db = require('../../models');

// A brand-scoped holder of `code` (Brand Admin, a Brand-level power) may only
// touch documents of employees in their own Brand(s). Resolved from the
// target employee's own record, never a client-supplied brandId.
async function isEmployeeInBrandScope(auth, code, employeeId) {
  const scope = await getBrandScope(auth, code);
  if (!scope.allowed) return false;
  if (scope.companyWide) return true;
  const employee = await db.Employee.findByPk(employeeId, { attributes: ['id', 'brandId'] });
  return !!employee && scope.brandIds.some((brandId) => String(brandId) === String(employee.brandId));
}

function requireVerifyAccess(req, res, next) {
  isEmployeeInBrandScope(req.auth, 'employee_document:verify', req.params.employeeId)
    .then((ok) => (ok ? next() : res.status(403).json({ error: 'Forbidden', permission: 'employee_document:verify' })))
    .catch(next);
}
const { upload } = require('../../middleware/upload.middleware');

const router = Router({ mergeParams: true });
router.use(requireAuth);

// employee_document:read (any) OR employee_document:read_own limited to the
// caller's own linked employee record.
async function requireDocumentReadAccess(req, res, next) {
  try {
    if (await isEmployeeInBrandScope(req.auth, 'employee_document:read', req.params.employeeId)) return next();

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

// employee_document:upload (any) OR employee_document:upload_own limited to
// the caller's own linked employee record — self-service document upload.
async function requireDocumentUploadAccess(req, res, next) {
  try {
    if (await isEmployeeInBrandScope(req.auth, 'employee_document:upload', req.params.employeeId)) return next();

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
router.get('/:id', requireDocumentReadAccess, controller.get);
router.post('/', requireDocumentUploadAccess, upload.single('file'), controller.upload);
// Correcting the title or removing a document is the same grant as
// uploading one in the first place (admin employee_document:upload, or the
// employee's own upload_own) — the service layer is what actually blocks
// either once the document is verified.
router.patch('/:id', requireDocumentUploadAccess, controller.update);
router.delete('/:id', requireDocumentUploadAccess, controller.remove);
router.patch('/:id/verify', requireVerifyAccess, controller.verify);
router.patch('/:id/reject', requireVerifyAccess, controller.reject);

module.exports = router;
