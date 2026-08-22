'use strict';

const { Router } = require('express');
const controller = require('./auth.controller');
const { requireAuth, requireSuperAdmin } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const { upload } = require('../../middleware/upload.middleware');

const router = Router();

router.post(
  '/signup-invite',
  requireAuth,
  requireSuperAdmin,
  requirePermission('user:invite'),
  controller.signupInvite
);
router.post(
  '/signup-invite-group',
  requireAuth,
  requireSuperAdmin,
  requirePermission('user:invite'),
  controller.signupInviteGroup
);
router.post(
  '/signup-invite-employee',
  requireAuth,
  requirePermission('user:invite'),
  controller.signupInviteEmployee
);
router.post(
  '/signup-invite-brand',
  requireAuth,
  requireSuperAdmin,
  requirePermission('user:invite'),
  controller.signupInviteBrand
);
router.post(
  '/transfer-employee-login',
  requireAuth,
  requirePermission('user:invite'),
  controller.transferEmployeeLoginEmail
);
router.post('/activate', controller.activate);
router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.me);
router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);
// Any authenticated user may change their own password — no permission
// code, since this isn't a resource-scoped action like the rest of RBAC.
router.post('/change-password', requireAuth, controller.changePassword);
// Self-service profile photo for admin-only accounts (no linked Employee —
// see employee.routes.js's own /me/photo pair for accounts that do have
// one). Same "not a resource-scoped RBAC action" reasoning as
// change-password above.
router.post('/me/photo', requireAuth, upload.single('photo'), controller.uploadMyPhoto);
router.delete('/me/photo', requireAuth, controller.removeMyPhoto);

module.exports = router;
