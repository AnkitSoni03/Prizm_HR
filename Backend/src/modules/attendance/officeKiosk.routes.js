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

// SSE stream itself is ticket-authenticated, not JWT — EventSource can't
// send an Authorization header. Every other route here is a normal
// authenticated request.
router.get('/office-video-stream', controller.videoStream);

router.use(requireAuth);

router.get('/office-token', requirePermission('attendance:kiosk_token'), controller.issueOfficeToken);
router.post('/office-video-stream/ticket', requirePermission('attendance:kiosk_video'), controller.issueSseTicket);
router.post(
  '/office-video/:attendanceId',
  requirePermission('attendance:kiosk_video'),
  uploadVideo.single('video'),
  controller.uploadVideo
);

router.post('/verify-office-qr', requirePermission('attendance:mark'), controller.verifyOfficeQr);
router.post('/verify-office-biometric', requirePermission('attendance:mark'), controller.verifyOfficeBiometric);

router.post('/scanner-accounts', requirePermission('scanner_account:create'), controller.createScannerAccount);
router.get('/scanner-accounts', requirePermission('scanner_account:create'), controller.listScannerAccounts);

module.exports = router;
