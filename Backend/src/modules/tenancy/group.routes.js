'use strict';

const { Router } = require('express');
const controller = require('./group.controller');
const { requireAuth, requireSuperAdmin } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('group:read'), controller.list);
router.post('/', requireSuperAdmin, requirePermission('group:create'), controller.create);
router.patch('/:id', requireSuperAdmin, requirePermission('group:update'), controller.update);
router.get(
  '/:id/admin-invitation',
  requireSuperAdmin,
  requirePermission('user:invite'),
  controller.getAdminInvitation
);
router.delete('/:id', requireSuperAdmin, requirePermission('group:delete'), controller.remove);

module.exports = router;
