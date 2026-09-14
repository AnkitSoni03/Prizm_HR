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

async function listDepartments({ companyId, brandId, scopedBrandIds, limit, offset }) {
  // Department's tenant-scope hook already filters by company_id for a
  // scoped caller; the explicit where only matters for Super Admin (hook is
  // a no-op when the caller's own companyId is null).
  const where = companyId ? { companyId } : {};
  applyBrandListScope(where, { brandId, scopedBrandIds });

  const { rows, count } = await db.Department.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
  });
  return { rows, count };
}

async function getDepartmentForRead(id) {
  const department = await db.Department.findOne({ where: { id } });
  if (!department) throw new HttpError(404, 'Department not found');
  return department;
}

async function getDepartmentForWrite({ companyId, id, scopedBrandIds }) {
  const department = await db.Department.findOne({ where: { id, companyId } });
  if (!department) throw new HttpError(404, 'Department not found');
  assertBrandWriteScope({ scopedBrandIds, recordBrandId: department.brandId });
  return department;
}

async function createDepartment({ companyId, brandId, scopedBrandIds, name, code }) {
  const resolvedBrandId = resolveCreateBrandId({ brandId, scopedBrandIds });
  await assertBrandBelongsToCompany({ brandId: resolvedBrandId, companyId });
  return db.Department.create({ companyId, brandId: resolvedBrandId, name, code });
}

async function updateDepartment({ companyId, id, updates, scopedBrandIds }) {
  const department = await getDepartmentForWrite({ companyId, id, scopedBrandIds });
  const { name, code, headEmployeeId, brandId } = updates;

  assertBrandReassignAllowed({ scopedBrandIds, brandIdProvided: brandId !== undefined });
  if (brandId !== undefined) await assertBrandBelongsToCompany({ brandId, companyId });

  if (headEmployeeId) {
    const head = await db.Employee.findOne({ where: { id: headEmployeeId, companyId } });
    if (!head) throw new HttpError(400, 'headEmployeeId not found for this company');
  }

  await department.update({
    ...(name !== undefined && { name }),
    ...(code !== undefined && { code }),
    ...(headEmployeeId !== undefined && { headEmployeeId }),
    ...(brandId !== undefined && { brandId: brandId || null }),
  });

  return department;
}

async function deleteDepartment({ companyId, id, scopedBrandIds }) {
  const department = await getDepartmentForWrite({ companyId, id, scopedBrandIds });

  const activeEmployeeCount = await db.Employee.count({ where: { departmentId: id, companyId } });
  if (activeEmployeeCount > 0) {
    throw new HttpError(409, `Cannot delete department: ${activeEmployeeCount} employee(s) still assigned`);
  }

  await department.destroy();
}

module.exports = {
  listDepartments,
  getDepartmentForRead,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
