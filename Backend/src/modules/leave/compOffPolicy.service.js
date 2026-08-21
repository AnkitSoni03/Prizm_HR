'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function listCompOffPolicies({ companyId }) {
  // Relies on CompOffPolicy's tenant-scope hook for company_id filtering.
  return db.CompOffPolicy.findAll({
    where: {},
    order: [['name', 'ASC']],
  });
}

async function getCompOffPolicyForWrite({ companyId, id }) {
  const policy = await db.CompOffPolicy.findOne({ where: { id, companyId } });
  if (!policy) throw new HttpError(404, 'Comp-off policy not found');
  return policy;
}

async function createCompOffPolicy({ companyId, name, expiryDays, carryForward, createdBy }) {
  if (!name || !name.trim()) throw new HttpError(400, 'name is required');
  if (!carryForward && (expiryDays === undefined || expiryDays === null || Number(expiryDays) <= 0)) {
    throw new HttpError(400, 'expiryDays must be a positive number unless carryForward is enabled');
  }

  return db.CompOffPolicy.create({
    companyId,
    name: name.trim(),
    expiryDays: expiryDays !== undefined && expiryDays !== null ? Number(expiryDays) : 90,
    carryForward: !!carryForward,
    createdBy: createdBy || null,
    updatedBy: createdBy || null,
  });
}

async function updateCompOffPolicy({ companyId, id, updates, updatedBy }) {
  const policy = await getCompOffPolicyForWrite({ companyId, id });
  const { name, expiryDays, carryForward } = updates;

  const nextCarryForward = carryForward !== undefined ? !!carryForward : policy.carryForward;
  if (!nextCarryForward) {
    const nextExpiryDays = expiryDays !== undefined ? Number(expiryDays) : policy.expiryDays;
    if (!nextExpiryDays || nextExpiryDays <= 0) {
      throw new HttpError(400, 'expiryDays must be a positive number unless carryForward is enabled');
    }
  }

  await policy.update({
    ...(name !== undefined && { name: name.trim() }),
    ...(expiryDays !== undefined && { expiryDays: Number(expiryDays) }),
    ...(carryForward !== undefined && { carryForward: !!carryForward }),
    updatedBy: updatedBy || null,
  });
  return policy;
}

// 409 (not a hard failure) when employees are still enrolled — same
// delete-guard shape as department.service.js::deleteDepartment. Existing
// comp_off_credits already earned under this policy are untouched either
// way (the FK is ON DELETE SET NULL on employees.comp_off_policy_id, and
// comp_off_credits carries no FK back to the policy at all — it's a
// point-in-time snapshot, not a live reference).
async function deleteCompOffPolicy({ companyId, id }) {
  const policy = await getCompOffPolicyForWrite({ companyId, id });

  const assignedCount = await db.Employee.count({ where: { compOffPolicyId: id, companyId } });
  if (assignedCount > 0) {
    throw new HttpError(409, `Cannot delete policy: ${assignedCount} employee(s) still assigned`);
  }

  await policy.destroy();
}

// scopedBrandIds mirrors every other brand-scoped list in this codebase
// (rbac.middleware.js's requirePermission output): null = company-wide
// caller (Company Admin/HR Manager), an array = Brand Admin restricted to
// their own brand(s).
async function listEmployeesForAssignment({ companyId, scopedBrandIds, search }) {
  const where = { companyId, status: 'active' };
  if (scopedBrandIds) where.brandId = { [Op.in]: scopedBrandIds };
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [{ name: { [Op.iLike]: term } }, { employeeCode: { [Op.iLike]: term } }];
  }

  return db.Employee.findAll({
    where,
    attributes: ['id', 'employeeCode', 'name', 'brandId'],
    include: [
      { model: db.Department, as: 'department', attributes: ['id', 'name'] },
      { model: db.CompOffPolicy, as: 'compOffPolicy', attributes: ['id', 'name'] },
    ],
    order: [['name', 'ASC']],
  });
}

// compOffPolicyId may be null — un-enrolls the selected employees from the
// comp-off benefit entirely (their next holiday/week-off worked earns
// nothing, same as if they'd never been assigned). Each employee is updated
// independently so one out-of-scope id doesn't block the rest of the batch.
async function assignCompOffPolicy({ companyId, scopedBrandIds, employeeIds, compOffPolicyId }) {
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    throw new HttpError(400, 'employeeIds must be a non-empty array');
  }

  if (compOffPolicyId !== null && compOffPolicyId !== undefined) {
    await getCompOffPolicyForWrite({ companyId, id: compOffPolicyId });
  }

  const uniqueIds = [...new Set(employeeIds.map(String))];
  const employeeWhere = { id: { [Op.in]: uniqueIds }, companyId };
  if (scopedBrandIds) employeeWhere.brandId = { [Op.in]: scopedBrandIds };

  const employees = await db.Employee.findAll({ where: employeeWhere, attributes: ['id'] });
  if (employees.length !== uniqueIds.length) {
    throw new HttpError(400, 'One or more selected employees are not in scope');
  }

  await db.Employee.update(
    { compOffPolicyId: compOffPolicyId ?? null },
    { where: { id: { [Op.in]: uniqueIds } } }
  );

  return { updated: employees.length };
}

module.exports = {
  listCompOffPolicies,
  getCompOffPolicyForWrite,
  createCompOffPolicy,
  updateCompOffPolicy,
  deleteCompOffPolicy,
  listEmployeesForAssignment,
  assignCompOffPolicy,
};
