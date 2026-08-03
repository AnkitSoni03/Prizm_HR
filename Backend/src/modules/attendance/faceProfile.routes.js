'use strict';

const { Router } = require('express');
const controller = require('./faceProfile.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.post('/', requirePermission('face_profile:register'), controller.register);
router.get('/me', requirePermission('face_profile:read_own'), controller.myStatus);

module.exports = router;
