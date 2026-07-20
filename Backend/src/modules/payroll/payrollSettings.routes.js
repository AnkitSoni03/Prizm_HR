'use strict';

const { Router } = require('express');
const controller = require('./payrollSettings.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('payroll_settings:read'), controller.get);
router.patch('/', requirePermission('payroll_settings:update'), controller.update);

module.exports = router;
