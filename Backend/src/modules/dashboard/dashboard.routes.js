'use strict';

const { Router } = require('express');
const controller = require('./dashboard.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/summary', requirePermission('company:read'), controller.summary);
router.get('/brand-summary', requirePermission('brand:read'), controller.brandSummary);
router.get('/group-summary', requirePermission('group:read'), controller.groupSummary);

module.exports = router;
