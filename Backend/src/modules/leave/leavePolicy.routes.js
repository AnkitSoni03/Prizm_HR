'use strict';

const { Router } = require('express');
const controller = require('./leavePolicy.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('leave_policy:read'), controller.list);
router.post('/', requirePermission('leave_policy:create'), controller.create);
router.patch('/:id', requirePermission('leave_policy:update'), controller.update);

module.exports = router;
