'use strict';

const { Router } = require('express');
const controller = require('./plan.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('plan:read'), controller.list);

module.exports = router;
