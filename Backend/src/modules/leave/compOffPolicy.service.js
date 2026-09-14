'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const {
  resolveCreateBrandId,
  assertBrandBelongsToCompany,
  applyBrandListScope,
  assertBrandWriteScope,
  assertBrandReassignAllowed,
} = require('../../utils/brandScope');

async function listCompOffPolicies({ companyId, brandId, scopedBrandIds }) {
  // Relies on CompOffPolicy's tenant-scope hook for company_id filtering.
  const where = {};
  applyBrandListScope(where, { brandId, scopedBrandIds });
  return db.CompOffPolicy.findAll({
    where,
    order: [['name', 'ASC']],
  });
}

async function getCompOffPolicyForWrite({ companyId, id, scopedBrandIds }) {
  const policy = await db.CompOffPolicy.findOne({ where: { id, companyId } });
  if (!policy) throw new HttpError(404, 'Comp-off policy not found');
  assertBrandWriteScope({ scopedBrandIds, recordBrandId: policy.brandId });
  return policy;
}

async function createCompOffPolicy({ companyId, brandId, scopedBrandIds, name, expiryDays, carryForward, createdBy }) {
  if (!name || !name.trim()) throw new HttpError(400, 'name is required');
  if (!carryForward && (expiryDays === undefined || expiryDays === null || Number(expiryDays) <= 0)) {
    throw new HttpError(400, 'expiryDays must be a positive number unless carryForward is enabled');
  }
  const resolvedBrandId = resolveCreateBrandId({ brandId, scopedBrandIds });
  await assertBrandBelongsToCompany({ brandId: resolvedBrandId, companyId });

  return db.CompOffPolicy.create({
    companyId,
    brandId: resolvedBrandId,
    name: name.trim(),
    expiryDays: expiryDays !== undefined && expiryDays !== null ? Number(expiryDays) : 90,
    carryForward: !!carryForward,
    createdBy: createdBy || null,
    updatedBy: createdBy || null,
  });
}

async function updateCompOffPolicy({ companyId, id, updates, updatedBy, scopedBrandIds }) {
  const policy = await getCompOffPolicyForWrite({ companyId, id, scopedBrandIds });
  const { name, expiryDays, carryForward, brandId } = updates;

  assertBrandReassignAllowed({ scopedBrandIds, brandIdProvided: brandId !== undefined });
  if (brandId !== undefined) await assertBrandBelongsToCompany({ brandId, companyId });

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
    ...(brandId !== undefined && { brandId: brandId || null }),
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
async function deleteCompOffPolicy({ companyId, id, scopedBrandIds }) {
  const policy = await getCompOffPolicyForWrite({ companyId, id, scopedBrandIds });

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
async function listEmployeesForAssignment({ companyId, brandId, scopedBrandIds, search }) {
  const where = { companyId, status: 'active' };
  // scopedBrandIds (a brand-scoped caller, e.g. Brand Admin) always wins —
  // an explicit brandId only ever lets a COMPANY-WIDE caller narrow their
  // otherwise-unfiltered view down to one Brand, same pattern as every
  // other admin list filtered by Brand in this codebase.
  if (scopedBrandIds) where.brandId = { [Op.in]: scopedBrandIds };
  else if (brandId) where.brandId = brandId;
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
    // Assigning is a lighter check than editing the policy itself — a
    // brand-scoped caller may assign any policy VISIBLE to them (their own
    // Brand's, or company-wide) to their own employees, even one they don't
    // "own" for editing purposes (assertBrandWriteScope would wrongly
    // reject a shared company-wide policy here).
    const policy = await db.CompOffPolicy.findOne({ where: { id: compOffPolicyId, companyId } });
    if (!policy) throw new HttpError(404, 'Comp-off policy not found');
    if (scopedBrandIds && policy.brandId && !scopedBrandIds.some((id) => String(id) === String(policy.brandId))) {
      throw new HttpError(403, "Policy is outside caller's brand");
    }
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
