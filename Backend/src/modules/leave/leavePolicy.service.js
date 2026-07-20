'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

async function assertBelongsToCompany(model, id, companyId, label) {
  const row = await model.findOne({ where: { id, companyId } });
  if (!row) throw new HttpError(400, `${label} not found for this company`);
}

async function listLeavePolicies({ limit, offset, leaveTypeId }) {
  const where = {};
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;

  // Relies on LeavePolicy's tenant-scope hook for company_id filtering.
  const { rows, count } = await db.LeavePolicy.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
    include: [{ model: db.LeaveType, as: 'leaveType' }],
  });
  return { rows, count };
}

async function getLeavePolicyForWrite({ companyId, id }) {
  const policy = await db.LeavePolicy.findOne({ where: { id, companyId } });
  if (!policy) throw new HttpError(404, 'Leave policy not found');
  return policy;
}

async function createLeavePolicy({ companyId, leaveTypeId, annualQuota, accrual, applicableAfterDays }) {
  await assertBelongsToCompany(db.LeaveType, leaveTypeId, companyId, 'Leave type');

  try {
    return await db.LeavePolicy.create({
      companyId,
      leaveTypeId,
      annualQuota,
      accrual: accrual || 'yearly',
      applicableAfterDays: applicableAfterDays || 0,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'A policy already exists for this leave type');
    }
    throw err;
  }
}

async function updateLeavePolicy({ companyId, id, updates }) {
  const policy = await getLeavePolicyForWrite({ companyId, id });
  const { annualQuota, accrual, applicableAfterDays } = updates;

  await policy.update({
    ...(annualQuota !== undefined && { annualQuota }),
    ...(accrual !== undefined && { accrual }),
    ...(applicableAfterDays !== undefined && { applicableAfterDays }),
  });
  return policy;
}

module.exports = { listLeavePolicies, getLeavePolicyForWrite, createLeavePolicy, updateLeavePolicy };
