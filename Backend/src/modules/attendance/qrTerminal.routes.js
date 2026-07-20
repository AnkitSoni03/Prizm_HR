'use strict';

const { Router } = require('express');
const controller = require('./qrTerminal.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();

// Terminal-authenticated route (physical device, no user session) — must be
// registered before requireAuth is applied to the rest of this router.
router.post('/:terminalCode/rotate', controller.rotate);

router.use(requireAuth);
router.get('/', requirePermission('qr_terminal:read'), controller.list);
router.get('/:id', requirePermission('qr_terminal:read'), controller.get);
router.post('/', requirePermission('qr_terminal:create'), controller.create);

module.exports = router;
