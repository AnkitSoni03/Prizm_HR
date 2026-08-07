'use strict';

const { Router } = require('express');
const multer = require('multer');
const controller = require('./faceFlag.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const { HttpError } = require('../../utils/errors');

// Same allowlist/size ceiling as officeKiosk.routes.js's video upload —
// this is the same class of artifact (a short kiosk capture clip), just
// attached to a blocked fraud attempt instead of an attendance row.
const MAX_VIDEO_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/webm', 'video/mp4']);
const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) {
      return cb(new HttpError(400, 'Unsupported video type. Allowed: webm, mp4.'));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(requireAuth);

// Admin review surface — same trust level as full attendance visibility.
router.get('/', requirePermission('attendance:read'), controller.list);
router.get('/:id/video-url', requirePermission('attendance:read'), controller.videoUrl);
router.patch('/:id/reviewed', requirePermission('attendance:update'), controller.markReviewed);

// Kiosk-side: same trust boundary as officeKiosk.routes.js's face-capture
// upload — a kiosk that can face-verify can upload the clip for its own
// blocked attempt.
router.post(
  '/:id/capture',
  requirePermission('attendance:face_verify'),
  uploadVideo.single('video'),
  controller.uploadCapture
);

module.exports = router;
