'use strict';

const { Router } = require('express');
const controller = require('./holiday.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('holiday:read'), controller.list);
router.post('/', requirePermission('holiday:create'), controller.create);
router.patch('/:id', requirePermission('holiday:update'), controller.update);
router.delete('/:id', requirePermission('holiday:delete'), controller.remove);

module.exports = router;
