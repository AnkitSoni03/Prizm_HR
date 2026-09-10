'use strict';

const { Router } = require('express');
const multer = require('multer');
const controller = require('./officeKiosk.controller');
const { requireAuth, requireSuperAdmin } = require('../../middleware/auth.middleware');
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

// --- Kiosk-side: the Scanner account acting as itself ----------------------

// A kiosk that can face-verify can also upload its own capture clip and
// manage its own location claim — same trust boundary, no extra permission.
router.post(
  '/face-capture/:attendanceId',
  requirePermission('attendance:face_verify'),
  uploadVideo.single('video'),
  controller.uploadFaceCapture
);

router.get('/kiosk/locations', requirePermission('attendance:face_verify'), controller.listMyLocations);
router.post('/kiosk/locations/claim', requirePermission('attendance:face_verify'), controller.claimLocation);
router.post('/kiosk/locations/heartbeat', requirePermission('attendance:face_verify'), controller.heartbeatLocation);
router.post('/kiosk/locations/release', requirePermission('attendance:face_verify'), controller.releaseLocation);

// --- Super Admin only: provisioning kiosk accounts -------------------------
//
// Gated structurally (requireSuperAdmin: company_id AND group_id both NULL)
// rather than by a permission code, for the same reason
// auth.service.js's signup-invite endpoints are: a Company or Brand Admin
// can legitimately hold broad codes within their own tenant without that
// ever granting a platform-level provisioning action. `scanner_account:create`
// is correspondingly revoked from every admin role in
// 20260910100000-seed-super-admin-only-kiosk-accounts.js.
router.post('/scanner-accounts', requireSuperAdmin, controller.createKioskAccount);
router.get('/scanner-accounts', requireSuperAdmin, controller.listKioskAccounts);
router.patch('/scanner-accounts/:id/locations', requireSuperAdmin, controller.updateKioskAccountLocations);
router.patch('/scanner-accounts/:id/password', requireSuperAdmin, controller.resetKioskAccountPassword);
router.get('/scanner-accounts/:id/password', requireSuperAdmin, controller.getKioskAccountPassword);
router.delete('/scanner-accounts/:id', requireSuperAdmin, controller.deleteKioskAccount);

module.exports = router;
