'use strict';

const { Router } = require('express');
const controller = require('./payslip.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

// /mine routes first so 'mine' never matches the /:id param route below.
router.get('/mine', requirePermission('payslip:read_own'), controller.listMine);
router.get('/mine/:id', requirePermission('payslip:read_own'), controller.getMine);
router.get('/mine/:id/pdf', requirePermission('payslip:read_own'), controller.getMinePdf);
router.get('/:id/pdf', requirePermission('payslip:read'), controller.getPdf);
router.get('/:id', requirePermission('payslip:read'), controller.get);

module.exports = router;
