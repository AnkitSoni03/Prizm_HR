'use strict';

const { Router } = require('express');
const controller = require('./notification.controller');
const { requireAuth, requireAuthSSE } = require('../../middleware/auth.middleware');

const router = Router();

// Mounted ahead of the blanket requireAuth below: EventSource can't set an
// Authorization header, so this route alone accepts the access token via a
// query param too (requireAuthSSE), instead of only the header.
router.get('/stream', requireAuthSSE, controller.stream);

router.use(requireAuth);

// No RBAC permission code — every authenticated user (Super Admin down to
// Employee) reads and manages only their own notifications, same shape as
// GET /auth/me or the /powers catalog.
router.get('/', controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/:id/read', controller.markRead);
router.patch('/read-all', controller.markAllRead);

module.exports = router;
