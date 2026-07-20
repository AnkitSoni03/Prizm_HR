'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function listDesignations({ companyId, limit, offset }) {
  // Designation's tenant-scope hook already filters by company_id for a
  // scoped caller; the explicit where only matters for Super Admin (hook is
  // a no-op when the caller's own companyId is null).
  const where = companyId ? { companyId } : {};

  const { rows, count } = await db.Designation.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
  });
  return { rows, count };
}

async function getDesignationForRead(id) {
  const designation = await db.Designation.findOne({ where: { id } });
  if (!designation) throw new HttpError(404, 'Designation not found');
  return designation;
}

async function getDesignationForWrite({ companyId, id }) {
  const designation = await db.Designation.findOne({ where: { id, companyId } });
  if (!designation) throw new HttpError(404, 'Designation not found');
  return designation;
}

async function createDesignation({ companyId, title, level }) {
  return db.Designation.create({ companyId, title, level });
}

async function updateDesignation({ companyId, id, updates }) {
  const designation = await getDesignationForWrite({ companyId, id });
  const { title, level } = updates;

  await designation.update({
    ...(title !== undefined && { title }),
    ...(level !== undefined && { level }),
  });
  return designation;
}

async function deleteDesignation({ companyId, id }) {
  const designation = await getDesignationForWrite({ companyId, id });

  const activeEmployeeCount = await db.Employee.count({ where: { designationId: id, companyId } });
  if (activeEmployeeCount > 0) {
    throw new HttpError(409, `Cannot delete designation: ${activeEmployeeCount} employee(s) still assigned`);
  }

  await designation.destroy();
}

module.exports = {
  listDesignations,
  getDesignationForRead,
  createDesignation,
  updateDesignation,
  deleteDesignation,
};
