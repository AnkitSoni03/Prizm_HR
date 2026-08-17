'use strict';

const { Router } = require('express');
const controller = require('./rosterGroup.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('roster_group:read'), controller.list);
router.get('/:id', requirePermission('roster_group:read'), controller.get);
router.post('/', requirePermission('roster_group:create'), controller.create);
router.patch('/:id', requirePermission('roster_group:update'), controller.update);
router.delete('/:id', requirePermission('roster_group:delete'), controller.remove);
router.post('/:id/assign', requirePermission('roster_group:update'), controller.assign);

module.exports = router;
