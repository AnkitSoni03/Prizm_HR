'use strict';

const path = require('path');
const { Storage } = require('@google-cloud/storage');

// Service account key lives on disk at Backend/gcs-key.json — gitignored
// (see .gitignore), never committed. Storage() reads project_id straight
// out of the key file itself, so nothing else needs configuring here.
const KEY_FILE_PATH = path.join(__dirname, '../../gcs-key.json');
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'hrms_prizm';

// Lazily created (same convention as mailer.js's transporter) so a missing
// key file only breaks upload/download calls, not server boot.
let storage = null;
function getStorage() {
  if (!storage) {
    storage = new Storage({ keyFilename: KEY_FILE_PATH });
  }
  return storage;
}

function getBucket() {
  return getStorage().bucket(BUCKET_NAME);
}

// Object paths are deliberately structured, not flat — every attachment
// lives under companies/{companyId}/<resource>/{resourceId}/{filename}, so
// the bucket stays human-browsable per tenant/resource in the GCS console
// and nothing from one company's folder can collide with another's.
function buildObjectPath({ companyId, resource, resourceId, fileName }) {
  return `companies/${companyId}/${resource}/${resourceId}/${fileName}`;
}

async function uploadBuffer({ buffer, destination, contentType }) {
  await getBucket().file(destination).save(buffer, { contentType, resumable: false });
  return destination;
}

const SIGNED_URL_TTL_MINUTES = 15;

// Bucket is private (no public/anonymous read) — every download link is a
// short-lived v4 signed URL minted fresh per request, only ever handed out
// after the caller already passed company_policy:read. Never persisted;
// re-generated on every list/read call (see companyPolicy.service.js).
// V4 signing is pure local crypto against the service account key (no
// network round trip to GCS), so callers mint two of these per file — one
// plain (inline preview) and one with `attachmentFileName` set (forces a
// real Save-As via Content-Disposition, since the `download` attribute on
// an <a> is ignored for cross-origin URLs like this signed one) — at
// effectively zero extra cost.
async function getSignedDownloadUrl(destination, { attachmentFileName } = {}) {
  const options = {
    version: 'v4',
    action: 'read',
    expires: Date.now() + SIGNED_URL_TTL_MINUTES * 60 * 1000,
  };
  if (attachmentFileName) {
    options.responseDisposition = `attachment; filename="${attachmentFileName.replace(/"/g, '')}"`;
  }
  const [url] = await getBucket().file(destination).getSignedUrl(options);
  return url;
}

async function deleteObject(destination) {
  await getBucket().file(destination).delete({ ignoreNotFound: true });
}

// Object paths are `{uuid}-{originalName}` (see buildObjectPath callers) —
// this recovers the human-readable originalName for a friendly Save-As
// filename, since the GCS object path itself is never shown to a user.
const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
function extractOriginalFileName(destination) {
  const base = destination.split('/').pop() || 'file';
  return base.replace(UUID_PREFIX_RE, '');
}

module.exports = { buildObjectPath, uploadBuffer, getSignedDownloadUrl, deleteObject, extractOriginalFileName };
