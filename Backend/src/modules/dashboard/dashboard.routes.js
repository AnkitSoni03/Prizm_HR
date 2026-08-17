'use strict';

const { Router } = require('express');
const controller = require('./dashboard.controller');
const { requireAuth, requireSuperAdmin } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/summary', requirePermission('company:read'), controller.summary);
router.get('/brand-summary', requirePermission('brand:read'), controller.brandSummary);
router.get('/group-summary', requirePermission('group:read'), controller.groupSummary);
// Structural gate, not a permission code — same shape as signup-invite's
// Super-Admin-only check (a platform-wide, unscoped summary should never be
// reachable via a generic 'ALL'-wildcard grant on some other role).
router.get('/platform-summary', requireSuperAdmin, controller.platformSummary);

module.exports = router;
