'use strict';

const multer = require('multer');
const { HttpError } = require('../utils/errors');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
]);

// Memory storage — files here are small policy documents, streamed straight
// to GCS (gcs.js::uploadBuffer) with no temp file ever written to disk.
// Reusable across modules (company policy today; employee documents could
// adopt the same pattern later).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new HttpError(400, 'Unsupported file type. Allowed: PDF, Word, PNG, JPEG.'));
    }
    cb(null, true);
  },
});

module.exports = { upload };
