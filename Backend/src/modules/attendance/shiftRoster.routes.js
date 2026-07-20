'use strict';

const { Router } = require('express');
const controller = require('./shiftRoster.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('shift_roster:read'), controller.list);
router.post('/', requirePermission('shift_roster:create'), controller.create);
router.patch('/:id', requirePermission('shift_roster:update'), controller.update);

module.exports = router;
