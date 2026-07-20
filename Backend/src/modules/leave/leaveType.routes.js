'use strict';

const { Router } = require('express');
const controller = require('./leaveType.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('leave_type:read'), controller.list);
router.get('/:id', requirePermission('leave_type:read'), controller.get);
router.post('/', requirePermission('leave_type:create'), controller.create);
router.patch('/:id', requirePermission('leave_type:update'), controller.update);

module.exports = router;
