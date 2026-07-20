'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { syncHrTeamRole } = require('../../utils/hrTeamSync');

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

async function createDepartment({ companyId, name, code, isHrDepartment }) {
  return db.Department.create({
    companyId,
    name,
    code,
    ...(isHrDepartment !== undefined && { isHrDepartment }),
  });
}

async function updateDepartment({ companyId, id, updates }) {
  const department = await getDepartmentForWrite({ companyId, id });
  const { name, code, headEmployeeId, isHrDepartment } = updates;

  if (headEmployeeId) {
    const head = await db.Employee.findOne({ where: { id: headEmployeeId, companyId } });
    if (!head) throw new HttpError(400, 'headEmployeeId not found for this company');
  }

  const isHrFlagChanging = isHrDepartment !== undefined && isHrDepartment !== department.isHrDepartment;

  await department.update({
    ...(name !== undefined && { name }),
    ...(code !== undefined && { code }),
    ...(headEmployeeId !== undefined && { headEmployeeId }),
    ...(isHrDepartment !== undefined && { isHrDepartment }),
  });

  // Retroactively sync every employee already sitting in this department
  // (not just future transfers/activations) when the HR flag itself flips —
  // e.g. Company Admin marks a pre-existing "HR" department as the HR
  // department after employees are already assigned to it. Best-effort per
  // employee (same convention as comp-off auto-detection in
  // attendance.service.js) — one employee's sync failing must never block
  // the department update itself or the rest of the batch.
  if (isHrFlagChanging) {
    const employees = await db.Employee.findAll({
      where: { departmentId: id, companyId, userId: { [Op.ne]: null } },
    });
    for (const employee of employees) {
      try {
        await syncHrTeamRole({ employeeId: employee.id });
      } catch (err) {
        console.error('HR Team role sync failed:', err);
      }
    }
  }

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
