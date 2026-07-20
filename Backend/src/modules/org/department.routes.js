'use strict';

const { Router } = require('express');
const controller = require('./department.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('department:read'), controller.list);
router.get('/:id', requirePermission('department:read'), controller.get);
router.post('/', requirePermission('department:create'), controller.create);
router.patch('/:id', requirePermission('department:update'), controller.update);
router.delete('/:id', requirePermission('department:delete'), controller.remove);

module.exports = router;
