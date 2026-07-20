'use strict';

const { Router } = require('express');
const controller = require('./payrollRun.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('payroll_run:read'), controller.list);
router.get('/:id', requirePermission('payroll_run:read'), controller.get);
router.get('/:id/payslips', requirePermission('payroll_run:read'), controller.listPayslips);
router.get('/:id/history', requirePermission('payroll_run:read'), controller.history);
router.post('/', requirePermission('payroll_run:create'), controller.create);
router.patch('/:id/process', requirePermission('payroll_run:process'), controller.process);
router.patch('/:id/pay', requirePermission('payroll_run:pay'), controller.pay);
router.patch('/:id/cancel', requirePermission('payroll_run:cancel'), controller.cancel);

module.exports = router;
