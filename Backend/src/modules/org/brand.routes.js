'use strict';

const { Router } = require('express');
const controller = require('./brand.controller');
const { requireAuth, requireSuperAdmin } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('brand:read'), controller.list);
router.get('/:id', requirePermission('brand:read'), controller.get);
router.post('/', requirePermission('brand:create'), controller.create);
router.patch('/:id', requirePermission('brand:update'), controller.update);
router.get(
  '/:id/admin-invitation',
  requireSuperAdmin,
  requirePermission('user:invite'),
  controller.getAdminInvitation
);
router.delete('/:id', requirePermission('brand:delete'), controller.remove);

module.exports = router;
