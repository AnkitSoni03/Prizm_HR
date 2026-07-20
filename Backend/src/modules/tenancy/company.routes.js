'use strict';

const { Router } = require('express');
const controller = require('./company.controller');
const { requireAuth, requireSuperAdmin } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('company:read'), controller.list);
router.get('/:id', requirePermission('company:read'), controller.getById);
router.post('/', requireSuperAdmin, requirePermission('company:create'), controller.create);
// Not requireSuperAdmin: Group Admin (group:update) and Company Admin
// (company:update) both hold this permission and may edit within their own
// scope — controller.update enforces that scope (and blocks status changes
// for anyone but Super Admin) since it's finer-grained than this middleware.
router.patch('/:id', requirePermission('company:update'), controller.update);
router.get(
  '/:id/admin-invitation',
  requireSuperAdmin,
  requirePermission('user:invite'),
  controller.getAdminInvitation
);
router.delete('/:id', requireSuperAdmin, requirePermission('company:delete'), controller.remove);

module.exports = router;
