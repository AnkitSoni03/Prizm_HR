'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function listDepartments({ companyId, limit, offset }) {
  // Department's tenant-scope hook already filters by company_id for a
  // scoped caller; the explicit where only matters for Super Admin (hook is
  // a no-op when the caller's own companyId is null).
  const where = companyId ? { companyId } : {};

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

async function getDepartmentForWrite({ companyId, id }) {
  const department = await db.Department.findOne({ where: { id, companyId } });
  if (!department) throw new HttpError(404, 'Department not found');
  return department;
}

async function createDepartment({ companyId, name, code }) {
  return db.Department.create({ companyId, name, code });
}

async function updateDepartment({ companyId, id, updates }) {
  const department = await getDepartmentForWrite({ companyId, id });
  const { name, code, headEmployeeId } = updates;

  if (headEmployeeId) {
    const head = await db.Employee.findOne({ where: { id: headEmployeeId, companyId } });
    if (!head) throw new HttpError(400, 'headEmployeeId not found for this company');
  }

  await department.update({
    ...(name !== undefined && { name }),
    ...(code !== undefined && { code }),
    ...(headEmployeeId !== undefined && { headEmployeeId }),
  });

  return department;
}

async function deleteDepartment({ companyId, id }) {
  const department = await getDepartmentForWrite({ companyId, id });

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
