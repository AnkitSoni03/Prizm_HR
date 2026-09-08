'use strict';

const { Router } = require('express');
const controller = require('./faceLiveness.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

// Same trust boundary as the check-in call itself — a kiosk that can
// face-verify can also start a liveness session.
router.post('/', requirePermission('attendance:face_verify'), controller.create);

module.exports = router;
