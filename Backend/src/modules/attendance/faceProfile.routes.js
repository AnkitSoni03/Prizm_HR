'use strict';

const { Router } = require('express');
const multer = require('multer');
const controller = require('./faceProfile.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const { HttpError } = require('../../utils/errors');

// Same shape as officeKiosk.routes.js's video upload, but for a single still
// photo (registration capture) instead of a clip.
const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_SIZE_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      return cb(new HttpError(400, 'Unsupported photo type. Allowed: jpeg, png.'));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(requireAuth);

router.post('/', requirePermission('face_profile:register'), uploadPhoto.single('photo'), controller.register);
router.get('/me', requirePermission('face_profile:read_own'), controller.myStatus);

module.exports = router;
