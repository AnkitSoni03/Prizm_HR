'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

// employee_documents has no company_id column of its own (see
// PHASE1_MODELS.md), so tenant isolation goes through the parent employee.
async function assertEmployeeInCompany({ companyId, employeeId }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  return employee;
}

async function listDocuments({ companyId, employeeId }) {
  await assertEmployeeInCompany({ companyId, employeeId });
  return db.EmployeeDocument.findAll({ where: { employeeId }, order: [['id', 'ASC']] });
}

async function getDocument({ companyId, employeeId, id }) {
  await assertEmployeeInCompany({ companyId, employeeId });
  const doc = await db.EmployeeDocument.findOne({ where: { id, employeeId } });
  if (!doc) throw new HttpError(404, 'Document not found');
  return doc;
}

async function uploadDocument({ companyId, employeeId, type, fileUrl }) {
  await assertEmployeeInCompany({ companyId, employeeId });
  return db.EmployeeDocument.create({ employeeId, type, fileUrl, verified: false });
}

async function verifyDocument({ companyId, employeeId, id }) {
  const doc = await getDocument({ companyId, employeeId, id });
  await doc.update({ verified: true });
  return doc;
}

module.exports = { listDocuments, getDocument, uploadDocument, verifyDocument };
