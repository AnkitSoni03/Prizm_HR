'use strict';

const { Router } = require('express');
const { Op } = require('sequelize');
const controller = require('./employee.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission, getBrandScope, grantWhere } = require('../../middleware/rbac.middleware');
const db = require('../../models');
const { runAsCompany } = require('../../config/tenant-context');
const { CUSTOM_POWER_ROLE_PREFIX } = require('../../utils/customPowerSync');
const { upload } = require('../../middleware/upload.middleware');
const employeeDocumentRoutes = require('./employeeDocument.routes');
const documentUploadRequestRoutes = require('./documentUploadRequest.routes');

const router = Router();
router.use(requireAuth);

// employee:read (any employee) OR employee:read_own limited to the caller's
// own linked employee record (req.auth.employeeId, set from the JWT).
async function requireEmployeeReadAccess(req, res, next) {
  try {
    // Brand-scoped readers (Brand Admin, a Brand-level power) get
    // req.auth.scopedBrandIds so controller.get can 404 another Brand's
    // employee — they could previously open any employee in the company by id.
    const scope = await getBrandScope(req.auth, 'employee:read');
    if (scope.allowed) {
      req.auth.scopedBrandIds = scope.companyWide ? null : scope.brandIds;
      return next();
    }

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
// No permission code — every employee can read their own manager list (same
// shape as the photo self-service routes above), used by the ESS Dashboard.
router.get('/me/managers', controller.getMyManagers);

// Manager picker — anyone who can create or edit an employee (and so set
// their managers). Before '/:id' so the path isn't read as an id.
async function requireManagerPickerAccess(req, res, next) {
  try {
    if (
      (await userHasPermission(req.auth, 'employee:update')) ||
      (await userHasPermission(req.auth, 'employee:create'))
    ) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden', permission: 'employee:update' });
  } catch (err) {
    next(err);
  }
}
router.get('/manager-options/companies', requireManagerPickerAccess, controller.getManagerCompanies);
router.get('/manager-options/employees', requireManagerPickerAccess, controller.getManagerEmployees);

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
// Group Admin and Super Admin (both company-less) pass structurally instead:
// they're the only callers allowed to grant Group-level powers, and Group
// Admin holds no employee:update of its own. Group Admin is still confined
// to its own Group's employees by getEmployeeForWrite's groupId check.
//
// employee:update must come from a real admin role, not from a per-employee
// power ("Manage Employees" grants employee:update too) — otherwise one
// power holder could hand out powers, including their own, to anyone.
async function holdsOutsidePowers(auth, code) {
  const grant = await runAsCompany(null, () =>
    db.UserRole.findOne({
      where: grantWhere(auth),
      include: [
        {
          model: db.Role,
          as: 'role',
          required: true,
          where: { name: { [Op.notLike]: `${CUSTOM_POWER_ROLE_PREFIX}%` } },
          include: [{ model: db.Permission, as: 'permissions', where: { code }, required: true }],
        },
      ],
    })
  );
  return !!grant;
}
async function requirePowerAssignAccess(req, res, next) {
  if (!req.auth.companyId) return next();
  try {
    if (!(await holdsOutsidePowers(req.auth, 'employee:update'))) {
      return res.status(403).json({ error: 'Only an admin can assign powers', permission: 'employee:update' });
    }
  } catch (err) {
    return next(err);
  }
  return requirePermission('employee:update')(req, res, next);
}
router.put('/:id/powers', requirePowerAssignAccess, controller.assignPowers);
// Same employee:update gate as the powers route above — any admin who can
// already edit an employee can manage their additional managers too.
router.put('/:id/managers', requirePermission('employee:update'), controller.setManagers);
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
