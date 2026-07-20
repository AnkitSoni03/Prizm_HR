'use strict';

const { Router } = require('express');
const controller = require('./shift.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('shift:read'), controller.list);
router.get('/:id', requirePermission('shift:read'), controller.get);
router.post('/', requirePermission('shift:create'), controller.create);
router.patch('/:id', requirePermission('shift:update'), controller.update);
router.delete('/:id', requirePermission('shift:delete'), controller.remove);

module.exports = router;
