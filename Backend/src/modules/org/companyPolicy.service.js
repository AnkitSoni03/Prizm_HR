'use strict';

const crypto = require('crypto');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { buildObjectPath, uploadBuffer, getSignedDownloadUrl, deleteObject, extractOriginalFileName } = require('../../utils/gcs');

// Mirrors holiday.service.js's audit-include shape exactly (creator/updater
// eager-loaded so both the admin-facing management page and the read-only
// ESS view can share one endpoint).
const AUDIT_INCLUDES = [
  {
    model: db.User,
    as: 'creator',
    attributes: ['id', 'email'],
    include: [{ model: db.Employee, as: 'employee', attributes: ['name'] }],
  },
  {
    model: db.User,
    as: 'updater',
    attributes: ['id', 'email'],
    include: [{ model: db.Employee, as: 'employee', attributes: ['name'] }],
  },
];

// `fileUrl` stores an internal GCS object path, not a browsable URL — the
// bucket is private, so every response mints two fresh, short-lived (~15
// min) v4 signed URLs (see gcs.js): `fileDownloadUrl` (plain, for inline
// preview — an <img>/<iframe> src) and `fileAttachmentUrl` (forced
// Content-Disposition: attachment, for a real Save-As via the Download
// button), only ever handed to a caller who already passed
// company_policy:read. Never persisted or reused past their ~15 minute
// expiry. Falls back to null (rather than throwing) on a GCS hiccup so a
// signing outage never breaks the whole list/read.
async function withDownloadUrl(policy) {
  const plain = policy.toJSON ? policy.toJSON() : policy;
  if (!plain.fileUrl) return { ...plain, fileDownloadUrl: null, fileAttachmentUrl: null };
  try {
    const [fileDownloadUrl, fileAttachmentUrl] = await Promise.all([
      getSignedDownloadUrl(plain.fileUrl),
      getSignedDownloadUrl(plain.fileUrl, { attachmentFileName: extractOriginalFileName(plain.fileUrl) }),
    ]);
    return { ...plain, fileDownloadUrl, fileAttachmentUrl };
  } catch (err) {
    console.error('Could not generate signed URL for policy attachment:', err);
    return { ...plain, fileDownloadUrl: null, fileAttachmentUrl: null };
  }
}

// No brandId — Company Policies are company-wide only (unlike Holidays,
// nothing about this request calls for per-Brand overrides). companyId is
// explicit (not left to the tenant-scope hook alone) so a Group Admin's
// company drill-in (whose own companyId is null — see CLAUDE.md's
// "tenant-scope hook + system-level rows" gotcha) can still scope this,
// same pattern as shift.service.js::listShifts.
async function listCompanyPolicies({ companyId, limit, offset }) {
  const where = companyId ? { companyId } : {};
  const { rows, count } = await db.CompanyPolicy.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'DESC']],
    include: AUDIT_INCLUDES,
  });
  return { rows: await Promise.all(rows.map(withDownloadUrl)), count };
}

async function getCompanyPolicyForWrite({ companyId, id }) {
  const policy = await db.CompanyPolicy.findOne({ where: { id, companyId } });
  if (!policy) throw new HttpError(404, 'Company Policy not found');
  return policy;
}

// fileUrl is deliberately not a create/update input — it's an internal GCS
// object path, only ever set by uploadPolicyAttachment below. Accepting it
// as freeform client input would let a caller point fileDownloadUrl
// generation at an arbitrary object path in the bucket.
async function createCompanyPolicy({ companyId, title, body, createdBy }) {
  const policy = await db.CompanyPolicy.create({
    companyId,
    title,
    body: body || null,
    createdBy: createdBy || null,
  });
  return withDownloadUrl(policy);
}

async function updateCompanyPolicy({ companyId, id, updates, updatedBy }) {
  const policy = await getCompanyPolicyForWrite({ companyId, id });
  const { title, body } = updates;

  await policy.update({
    ...(title !== undefined && { title }),
    ...(body !== undefined && { body }),
    updatedBy: updatedBy || null,
  });
  return withDownloadUrl(policy);
}

async function deleteCompanyPolicy({ companyId, id }) {
  const policy = await getCompanyPolicyForWrite({ companyId, id });
  if (policy.fileUrl) {
    try {
      await deleteObject(policy.fileUrl);
    } catch (err) {
      console.error('Could not delete policy attachment from storage:', err);
    }
  }
  await policy.destroy();
}

// Replaces this policy's attachment wholesale — a previous attachment (if
// any) is best-effort deleted from the bucket first so orphaned objects
// don't accumulate. originalName is sanitized into the object path only
// (never trusted for anything else); mimeType is already validated against
// an allowlist by upload.middleware.js before this ever runs.
async function uploadPolicyAttachment({ companyId, id, buffer, originalName, mimeType, updatedBy }) {
  const policy = await getCompanyPolicyForWrite({ companyId, id });

  if (policy.fileUrl) {
    try {
      await deleteObject(policy.fileUrl);
    } catch (err) {
      console.error('Could not delete previous policy attachment:', err);
    }
  }

  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destination = buildObjectPath({
    companyId,
    resource: 'company-policies',
    resourceId: policy.id,
    fileName: `${crypto.randomUUID()}-${safeName}`,
  });
  await uploadBuffer({ buffer, destination, contentType: mimeType });

  await policy.update({ fileUrl: destination, updatedBy: updatedBy || null });
  return withDownloadUrl(policy);
}

module.exports = {
  listCompanyPolicies,
  getCompanyPolicyForWrite,
  createCompanyPolicy,
  updateCompanyPolicy,
  deleteCompanyPolicy,
  uploadPolicyAttachment,
};
