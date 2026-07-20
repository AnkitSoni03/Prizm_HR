'use strict';

const { Router } = require('express');
const controller = require('./payrollAdjustment.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('payroll_adjustment:read'), controller.list);
router.post('/', requirePermission('payroll_adjustment:create'), controller.create);
router.patch('/:id', requirePermission('payroll_adjustment:update'), controller.update);
router.delete('/:id', requirePermission('payroll_adjustment:delete'), controller.remove);

module.exports = router;
