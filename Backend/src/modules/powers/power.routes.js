'use strict';

const { Router } = require('express');
const controller = require('./power.controller');
const { requireAuth } = require('../../middleware/auth.middleware');

const router = Router();
router.use(requireAuth);

// Metadata only (labels/descriptions/constituent permission codes) — not
// sensitive, so no extra permission gate beyond being logged in. Used both
// by the admin-facing "assign powers" UI and by the ESS Dashboard's "Your
// Additional Responsibilities" section.
router.get('/', controller.list);

module.exports = router;
