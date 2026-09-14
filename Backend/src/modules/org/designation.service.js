'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const {
  resolveCreateBrandId,
  assertBrandBelongsToCompany,
  applyBrandListScope,
  assertBrandWriteScope,
  assertBrandReassignAllowed,
} = require('../../utils/brandScope');

async function listDesignations({ companyId, brandId, scopedBrandIds, limit, offset }) {
  // Designation's tenant-scope hook already filters by company_id for a
  // scoped caller; the explicit where only matters for Super Admin (hook is
  // a no-op when the caller's own companyId is null).
  const where = companyId ? { companyId } : {};
  applyBrandListScope(where, { brandId, scopedBrandIds });

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

async function getDesignationForWrite({ companyId, id, scopedBrandIds }) {
  const designation = await db.Designation.findOne({ where: { id, companyId } });
  if (!designation) throw new HttpError(404, 'Designation not found');
  assertBrandWriteScope({ scopedBrandIds, recordBrandId: designation.brandId });
  return designation;
}

async function createDesignation({ companyId, brandId, scopedBrandIds, title, level }) {
  const resolvedBrandId = resolveCreateBrandId({ brandId, scopedBrandIds });
  await assertBrandBelongsToCompany({ brandId: resolvedBrandId, companyId });
  return db.Designation.create({ companyId, brandId: resolvedBrandId, title, level });
}

async function updateDesignation({ companyId, id, updates, scopedBrandIds }) {
  const designation = await getDesignationForWrite({ companyId, id, scopedBrandIds });
  const { title, level, brandId } = updates;

  assertBrandReassignAllowed({ scopedBrandIds, brandIdProvided: brandId !== undefined });
  if (brandId !== undefined) await assertBrandBelongsToCompany({ brandId, companyId });

  await designation.update({
    ...(title !== undefined && { title }),
    ...(level !== undefined && { level }),
    ...(brandId !== undefined && { brandId: brandId || null }),
  });
  return designation;
}

async function deleteDesignation({ companyId, id, scopedBrandIds }) {
  const designation = await getDesignationForWrite({ companyId, id, scopedBrandIds });

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
