'use strict';

const { Router } = require('express');
const controller = require('./salaryComponent.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('salary_component:read'), controller.list);
router.post('/', requirePermission('salary_component:create'), controller.create);
router.patch('/:id', requirePermission('salary_component:update'), controller.update);
router.delete('/:id', requirePermission('salary_component:delete'), controller.remove);

module.exports = router;
