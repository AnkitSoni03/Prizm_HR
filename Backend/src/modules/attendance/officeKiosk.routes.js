'use strict';

const { Router } = require('express');
const multer = require('multer');
const controller = require('./officeKiosk.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const { HttpError } = require('../../utils/errors');

// Separate from middleware/upload.middleware.js's `upload` (policy documents,
// PDF/Word/images, 10MB) — kiosk clips are short but video, need their own
// mime allowlist and a larger size ceiling.
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

// A kiosk that can face-verify can also upload its own capture clip — no
// separate permission needed, it's the same trust boundary.
router.post(
  '/face-capture/:attendanceId',
  requirePermission('attendance:face_verify'),
  uploadVideo.single('video'),
  controller.uploadFaceCapture
);

router.post('/scanner-accounts', requirePermission('scanner_account:create'), controller.createScannerAccount);
router.get('/scanner-accounts', requirePermission('scanner_account:create'), controller.listScannerAccounts);
router.patch(
  '/scanner-accounts/:id/password',
  requirePermission('scanner_account:create'),
  controller.resetScannerAccountPassword
);
router.get(
  '/scanner-accounts/:id/password',
  requirePermission('scanner_account:create'),
  controller.getScannerAccountPassword
);

module.exports = router;
