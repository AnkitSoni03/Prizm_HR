'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { assertRosterGroupsBelongToCompany } = require('../../utils/rosterGroupAssignment');

async function assertBelongsToCompany(model, id, companyId, label) {
  const row = await model.findOne({ where: { id, companyId } });
  if (!row) throw new HttpError(400, `${label} not found for this company`);
}

const READ_INCLUDES = [
  { model: db.LeaveType, as: 'leaveType' },
  { model: db.RosterGroup, as: 'rosterGroups', through: { attributes: [] } },
];

// rosterGroupId (singular): undefined = every policy (defaults + overrides);
// null = only the company-wide default(s) (zero Roster links); a real id =
// only that Roster's override.
async function listLeavePolicies({ limit, offset, leaveTypeId, rosterGroupId }) {
  const where = {};
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;

  // Relies on LeavePolicy's tenant-scope hook for company_id filtering.
  const { rows, count } = await db.LeavePolicy.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
    include: READ_INCLUDES,
  });
  const filtered =
    rosterGroupId === undefined
      ? rows
      : rosterGroupId === null
        ? rows.filter((p) => p.rosterGroups.length === 0)
        : rows.filter((p) => p.rosterGroups.some((rg) => String(rg.id) === String(rosterGroupId)));
  return { rows: filtered, count };
}

async function getLeavePolicyForWrite({ companyId, id }) {
  const policy = await db.LeavePolicy.findOne({ where: { id, companyId } });
  if (!policy) throw new HttpError(404, 'Leave policy not found');
  return policy;
}

// A given (leaveType, Roster Group) pair can be covered by at most one
// policy — same invariant the old rosterGroupId column's partial unique
// index used to enforce, now checked here against
// roster_group_leave_policies since LeavePolicy itself carries no unique
// constraint beyond its primary key (see the migration that dropped it: a
// plain (company, leaveType) unique index would have made Roster-scoped
// overrides impossible). excludePolicyId lets an update re-save a policy's
// own existing links without tripping over itself.
async function assertNoLeaveTypeConflict({ companyId, leaveTypeId, rosterGroupIds, excludePolicyId }) {
  if (!rosterGroupIds || rosterGroupIds.length === 0) {
    // Company-wide default: at most one LeavePolicy for this leaveType with
    // zero Roster links.
    const candidates = await db.LeavePolicy.findAll({
      where: { companyId, leaveTypeId },
      include: [{ model: db.RosterGroup, as: 'rosterGroups', through: { attributes: [] }, attributes: ['id'] }],
    });
    const conflict = candidates.find(
      (p) => String(p.id) !== String(excludePolicyId) && p.rosterGroups.length === 0
    );
    if (conflict) throw new HttpError(409, 'A company-wide policy already exists for this leave type');
    return;
  }

  const existingLinks = await db.RosterGroupLeavePolicy.findAll({
    where: { rosterGroupId: rosterGroupIds, leaveTypeId },
    include: [{ model: db.RosterGroup, as: 'rosterGroup', attributes: ['name'] }],
  });
  const conflict = existingLinks.find((link) => String(link.leavePolicyId) !== String(excludePolicyId));
  if (conflict) {
    throw new HttpError(409, `Roster "${conflict.rosterGroup.name}" already has a policy for this leave type`);
  }
}

async function syncLeavePolicyRosterGroups(leavePolicyId, leaveTypeId, rosterGroupIds) {
  await db.RosterGroupLeavePolicy.destroy({ where: { leavePolicyId } });
  if (rosterGroupIds && rosterGroupIds.length > 0) {
    await db.RosterGroupLeavePolicy.bulkCreate(
      rosterGroupIds.map((rosterGroupId) => ({ leavePolicyId, rosterGroupId, leaveTypeId }))
    );
  }
}

async function createLeavePolicy({ companyId, leaveTypeId, rosterGroupIds, annualQuota, accrual, applicableAfterDays }) {
  await assertBelongsToCompany(db.LeaveType, leaveTypeId, companyId, 'Leave type');
  await assertRosterGroupsBelongToCompany(rosterGroupIds, companyId);
  await assertNoLeaveTypeConflict({ companyId, leaveTypeId, rosterGroupIds, excludePolicyId: null });

  const policy = await db.LeavePolicy.create({
    companyId,
    leaveTypeId,
    annualQuota,
    accrual: accrual || 'yearly',
    applicableAfterDays: applicableAfterDays || 0,
  });

  if (rosterGroupIds !== undefined) await syncLeavePolicyRosterGroups(policy.id, leaveTypeId, rosterGroupIds);
  return db.LeavePolicy.findOne({ where: { id: policy.id }, include: READ_INCLUDES });
}

async function updateLeavePolicy({ companyId, id, updates }) {
  const policy = await getLeavePolicyForWrite({ companyId, id });
  const { annualQuota, accrual, applicableAfterDays, rosterGroupIds } = updates;

  if (rosterGroupIds !== undefined) {
    await assertRosterGroupsBelongToCompany(rosterGroupIds, companyId);
    await assertNoLeaveTypeConflict({
      companyId,
      leaveTypeId: policy.leaveTypeId,
      rosterGroupIds,
      excludePolicyId: id,
    });
  }

  await policy.update({
    ...(annualQuota !== undefined && { annualQuota }),
    ...(accrual !== undefined && { accrual }),
    ...(applicableAfterDays !== undefined && { applicableAfterDays }),
  });

  if (rosterGroupIds !== undefined) await syncLeavePolicyRosterGroups(id, policy.leaveTypeId, rosterGroupIds);
  return db.LeavePolicy.findOne({ where: { id }, include: READ_INCLUDES });
}

module.exports = { listLeavePolicies, getLeavePolicyForWrite, createLeavePolicy, updateLeavePolicy };
