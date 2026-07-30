'use strict';

const crypto = require('crypto');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { notifyUser, notifyApprovers } = require('../../utils/notifications');
const { buildObjectPath, uploadBuffer, getSignedDownloadUrl, extractOriginalFileName } = require('../../utils/gcs');

// employee_documents has no company_id column of its own (see
// PHASE1_MODELS.md), so tenant isolation goes through the parent employee.
async function assertEmployeeInCompany({ companyId, employeeId }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  return employee;
}

// Who verified a document (and when) — same audit shape as
// holiday.service.js/companyPolicy.service.js's creator/updater includes.
const VERIFIER_INCLUDE = [
  {
    model: db.User,
    as: 'verifier',
    attributes: ['id', 'email'],
    include: [{ model: db.Employee, as: 'employee', attributes: ['name'] }],
  },
];

// `fileUrl` stores an internal GCS object path, not a browsable URL — the
// bucket is private, so every response mints two fresh, short-lived (~15
// min) v4 signed URLs (see gcs.js): `fileDownloadUrl` (plain, for inline
// preview — an <img>/<iframe> src) and `fileAttachmentUrl` (forced
// Content-Disposition: attachment, for a real Save-As via the Download
// button). Same convention as companyPolicy.service.js/employee.service.js's
// photo handling. Falls back to null (not a throw) on a GCS hiccup so a
// signing outage never breaks the whole list/read.
async function withDownloadUrl(doc) {
  const plain = doc.toJSON ? doc.toJSON() : doc;
  if (!plain.fileUrl) return { ...plain, fileDownloadUrl: null, fileAttachmentUrl: null };
  try {
    const [fileDownloadUrl, fileAttachmentUrl] = await Promise.all([
      getSignedDownloadUrl(plain.fileUrl),
      getSignedDownloadUrl(plain.fileUrl, { attachmentFileName: extractOriginalFileName(plain.fileUrl) }),
    ]);
    return { ...plain, fileDownloadUrl, fileAttachmentUrl };
  } catch (err) {
    console.error('Could not generate signed URL for employee document:', err);
    return { ...plain, fileDownloadUrl: null, fileAttachmentUrl: null };
  }
}

async function listDocuments({ companyId, employeeId }) {
  await assertEmployeeInCompany({ companyId, employeeId });
  const docs = await db.EmployeeDocument.findAll({
    where: { employeeId },
    order: [['id', 'ASC']],
    include: VERIFIER_INCLUDE,
  });
  return Promise.all(docs.map(withDownloadUrl));
}

async function getDocument({ companyId, employeeId, id }) {
  await assertEmployeeInCompany({ companyId, employeeId });
  const doc = await db.EmployeeDocument.findOne({ where: { id, employeeId }, include: VERIFIER_INCLUDE });
  if (!doc) throw new HttpError(404, 'Document not found');
  return doc;
}

// originalName is sanitized into the object path only (never trusted for
// anything else); mimeType is already validated against an allowlist
// (PDF/Word/PNG/JPEG) by upload.middleware.js before this ever runs.
async function uploadDocument({ companyId, employeeId, type, buffer, originalName, mimeType }) {
  const employee = await assertEmployeeInCompany({ companyId, employeeId });

  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destination = buildObjectPath({
    companyId,
    resource: 'employee-documents',
    resourceId: employeeId,
    fileName: `${crypto.randomUUID()}-${safeName}`,
  });
  await uploadBuffer({ buffer, destination, contentType: mimeType });

  const doc = await db.EmployeeDocument.create({ employeeId, type, fileUrl: destination, verified: false });

  // Lets whoever can act on it (Company Admin/HR Manager/Brand Admin, or an
  // Employee holding the "Document Verification" power) know there's a new
  // document waiting for review — same submit-notifies-approvers convention
  // as leave/OD requests. Best-effort: notifyApprovers never throws.
  const employeeLabel = employee.name || employee.employeeCode;
  await notifyApprovers({
    companyId,
    brandId: employee.brandId,
    code: 'employee_document:verify',
    excludeUserId: employee.userId,
    type: 'approval_pending',
    requestType: 'employee_document',
    requestId: doc.id,
    title: `New document uploaded by ${employeeLabel}`,
    body: doc.type,
  });

  return withDownloadUrl(doc);
}

async function verifyDocument({ companyId, employeeId, id, verifiedByUserId }) {
  const doc = await getDocument({ companyId, employeeId, id });
  await doc.update({ verified: true, verifiedBy: verifiedByUserId || null, verifiedAt: new Date() });
  await doc.reload({ include: VERIFIER_INCLUDE });

  const employee = await db.Employee.findOne({ where: { id: employeeId }, attributes: ['userId'] });
  await notifyUser({
    companyId,
    userId: employee?.userId,
    type: 'document_verified',
    requestType: 'employee_document',
    requestId: doc.id,
    title: 'Document verified',
    body: `Your "${doc.type}" document has been verified.`,
  });

  return withDownloadUrl(doc);
}

module.exports = { listDocuments, getDocument, uploadDocument, verifyDocument, withDownloadUrl };
