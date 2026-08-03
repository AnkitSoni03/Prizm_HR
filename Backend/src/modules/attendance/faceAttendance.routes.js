'use strict';

const { Router } = require('express');
const controller = require('./faceAttendance.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.post('/', requirePermission('attendance:face_verify'), controller.faceCheckIn);

module.exports = router;
