'use strict';

const { Router } = require('express');
const controller = require('./compOffPolicy.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('comp_off_policy:read'), controller.list);
router.post('/', requirePermission('comp_off_policy:create'), controller.create);
router.patch('/:id', requirePermission('comp_off_policy:update'), controller.update);
router.delete('/:id', requirePermission('comp_off_policy:delete'), controller.remove);

router.get('/employees', requirePermission('comp_off_policy:assign'), controller.listEmployees);
router.post('/assign', requirePermission('comp_off_policy:assign'), controller.assign);

module.exports = router;
