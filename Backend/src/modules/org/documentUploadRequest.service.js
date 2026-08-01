'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { notifyUser } = require('../../utils/notifications');
const { getEmployeeForWrite } = require('./employee.service');

// Same audit-display shape as employeeDocument.service.js's VERIFIER_INCLUDE
// (consumed by the frontend's existing holidayAuditName helper).
const REQUESTED_BY_INCLUDE = [
  {
    model: db.User,
    as: 'requestedBy',
    attributes: ['id', 'email'],
    include: [{ model: db.Employee, as: 'employee', attributes: ['name'] }],
  },
];

// Brand-scope + existence guard shared with cancelRequest — mirrors
// employee.service.js::getEmployeeForWrite's 404-not-403 convention (a
// brand-scoped caller probing another brand's request id can't distinguish
// "not found" from "not yours").
async function getRequestForWrite({ companyId, id, scopedBrandIds }) {
  const request = await db.DocumentUploadRequest.findOne({ where: { id, companyId } });
  if (!request) throw new HttpError(404, 'Document request not found');
  if (scopedBrandIds) {
    const employee = await db.Employee.findByPk(request.employeeId, { attributes: ['brandId'] });
    if (!employee || !scopedBrandIds.some((brandId) => String(brandId) === String(employee.brandId))) {
      throw new HttpError(404, 'Document request not found');
    }
  }
  return request;
}

async function listRequests({ companyId, employeeId }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  return db.DocumentUploadRequest.findAll({
    where: { employeeId },
    order: [['id', 'DESC']],
    include: REQUESTED_BY_INCLUDE,
  });
}

// Gated by employee_document:verify on the route — the same permission an
// admin (or an Employee holding the "Document Verification" power) already
// needs to review/verify a document, reused here per the explicit ask
// ("admins or employees who have power of verify documents ... make a
// request"). scopedBrandIds enforces a Brand Admin/power-holder can only
// request from their own brand's employees, same as every other write in
// employee.service.js.
async function createRequest({ companyId, employeeId, scopedBrandIds, documentType, note, requestedByUserId }) {
  const employee = await getEmployeeForWrite({ companyId, id: employeeId, scopedBrandIds });

  const request = await db.DocumentUploadRequest.create({
    companyId,
    employeeId: employee.id,
    requestedByUserId: requestedByUserId || null,
    documentType,
    note: note || null,
    status: 'pending',
  });

  await notifyUser({
    companyId,
    userId: employee.userId,
    type: 'document_upload_request',
    requestType: 'document_upload_request',
    requestId: request.id,
    title: `Document requested: ${documentType}`,
    body: note || `Please upload your ${documentType}.`,
  });

  await request.reload({ include: REQUESTED_BY_INCLUDE });
  return request;
}

async function cancelRequest({ companyId, id, scopedBrandIds }) {
  const request = await getRequestForWrite({ companyId, id, scopedBrandIds });
  if (request.status !== 'pending') {
    throw new HttpError(409, 'Only a pending request can be cancelled');
  }
  await request.update({ status: 'cancelled' });
  await request.reload({ include: REQUESTED_BY_INCLUDE });
  return request;
}

// The employee's own "Done" acknowledgment on their My Profile page — a
// deliberately simple manual close, not tied to any specific uploaded
// document (they upload separately, through the normal Documents section).
// Scoped strictly to the caller's own employeeId at the route level
// (mirrors employeeDocument.routes.js's requireDocumentUploadAccess), and
// re-checked here too so this can never close another employee's request.
async function completeRequest({ companyId, employeeId, id }) {
  const request = await db.DocumentUploadRequest.findOne({ where: { id, companyId, employeeId } });
  if (!request) throw new HttpError(404, 'Document request not found');
  if (request.status !== 'pending') {
    throw new HttpError(409, 'Only a pending request can be marked done');
  }
  await request.update({ status: 'fulfilled' });
  return request;
}

module.exports = { listRequests, createRequest, cancelRequest, completeRequest, REQUESTED_BY_INCLUDE };
