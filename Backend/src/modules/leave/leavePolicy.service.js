'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { assertRosterGroupsBelongToCompany } = require('../../utils/rosterGroupAssignment');
const {
  resolveCreateBrandId,
  assertBrandBelongsToCompany,
  applyBrandListScope,
  assertBrandWriteScope,
  assertBrandReassignAllowed,
} = require('../../utils/brandScope');

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
async function listLeavePolicies({ limit, offset, leaveTypeId, brandId, scopedBrandIds, rosterGroupId }) {
  const where = {};
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;
  applyBrandListScope(where, { brandId, scopedBrandIds });

  // Relies on LeavePolicy's tenant-scope hook for company_id filtering.
  const { rows, count } = await db.LeavePolicy.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
    include: READ_INCLUDES,
  });
  const scoped =
    rosterGroupId === undefined
      ? rows
      : rosterGroupId === null
        ? rows.filter((p) => p.rosterGroups.length === 0)
        : rows.filter((p) => p.rosterGroups.some((rg) => String(rg.id) === String(rosterGroupId)));
  // The auto-provisioned "Week Off Leaves" policy (see
  // weekOffLeave.service.js) is system-managed — its quota is computed
  // fresh every month, never read from this row's own annualQuota — so it's
  // excluded from the normal Leave Policy Settings list the same way its
  // LeaveType is excluded from the "Add Leave Type" catalog.
  const filtered = scoped.filter((p) => !(p.leaveType && p.leaveType.isWeekOffBucket));
  return { rows: filtered, count };
}

async function getLeavePolicyForWrite({ companyId, id, scopedBrandIds }) {
  const policy = await db.LeavePolicy.findOne({ where: { id, companyId } });
  if (!policy) throw new HttpError(404, 'Leave policy not found');
  assertBrandWriteScope({ scopedBrandIds, recordBrandId: policy.brandId });
  return policy;
}

// A given (leaveType, Roster Group) pair can be covered by at most one
// policy — same invariant the old rosterGroupId column's partial unique
// index used to enforce, now checked here against
// roster_group_leave_policies since LeavePolicy itself carries no unique
// constraint beyond its primary key (see the migration that dropped it: a
// plain (company, leaveType) unique index would have made Roster-scoped
// overrides impossible). excludePolicyId lets an update re-save a policy's
// own existing links without tripping over itself. The "default" (zero
// Roster links) conflict check is scoped per-brand too — brandId null and
// each real brandId each get their own independent default, same as a
// Roster-scoped override is independent per Roster.
async function assertNoLeaveTypeConflict({ companyId, brandId, leaveTypeId, rosterGroupIds, excludePolicyId }) {
  if (!rosterGroupIds || rosterGroupIds.length === 0) {
    // Company/Brand-wide default: at most one LeavePolicy for this
    // (leaveType, brandId) pair with zero Roster links.
    const candidates = await db.LeavePolicy.findAll({
      where: { companyId, leaveTypeId, brandId: brandId || null },
      include: [{ model: db.RosterGroup, as: 'rosterGroups', through: { attributes: [] }, attributes: ['id'] }],
    });
    const conflict = candidates.find(
      (p) => String(p.id) !== String(excludePolicyId) && p.rosterGroups.length === 0
    );
    if (conflict) throw new HttpError(409, 'A default policy already exists for this leave type');
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

// Quota is either a fixed number of days or Unlimited (stored as
// annualQuota 0 + isUnlimited true). A linked leave type (e.g. Half Day,
// leave_types.deduct_from_leave_type_id set) has no quota of its own at all —
// its uses are charged against the source type's balance — so its policy only
// decides which Rosters can use it; the quota is pinned to 0 / not unlimited.
async function resolveQuota({ companyId, leaveTypeId, annualQuota, isUnlimited }) {
  const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId, companyId }, attributes: ['deductFromLeaveTypeId'] });
  if (leaveType && leaveType.deductFromLeaveTypeId) return { annualQuota: 0, isUnlimited: false };
  if (isUnlimited) return { annualQuota: 0, isUnlimited: true };

  const quota = Number(annualQuota);
  if (annualQuota === undefined || annualQuota === null || annualQuota === '' || !Number.isFinite(quota) || quota < 0) {
    throw new HttpError(400, 'Enter an annual quota (0 or more days), or choose Unlimited');
  }
  return { annualQuota: quota, isUnlimited: false };
}

async function createLeavePolicy({
  companyId,
  brandId,
  scopedBrandIds,
  leaveTypeId,
  rosterGroupIds,
  annualQuota,
  isUnlimited,
  accrual,
  applicableAfterDays,
}) {
  const resolvedBrandId = resolveCreateBrandId({ brandId, scopedBrandIds });
  await assertBrandBelongsToCompany({ brandId: resolvedBrandId, companyId });
  await assertBelongsToCompany(db.LeaveType, leaveTypeId, companyId, 'Leave type');
  const quota = await resolveQuota({ companyId, leaveTypeId, annualQuota, isUnlimited });
  await assertRosterGroupsBelongToCompany(rosterGroupIds, companyId, resolvedBrandId);
  await assertNoLeaveTypeConflict({ companyId, brandId: resolvedBrandId, leaveTypeId, rosterGroupIds, excludePolicyId: null });

  const policy = await db.LeavePolicy.create({
    companyId,
    brandId: resolvedBrandId,
    leaveTypeId,
    ...quota,
    accrual: accrual || 'yearly',
    applicableAfterDays: applicableAfterDays || 0,
  });

  if (rosterGroupIds !== undefined) await syncLeavePolicyRosterGroups(policy.id, leaveTypeId, rosterGroupIds);
  return db.LeavePolicy.findOne({ where: { id: policy.id }, include: READ_INCLUDES });
}

async function updateLeavePolicy({ companyId, id, updates, scopedBrandIds }) {
  const policy = await getLeavePolicyForWrite({ companyId, id, scopedBrandIds });
  const { annualQuota, isUnlimited, accrual, applicableAfterDays, rosterGroupIds, brandId } = updates;

  assertBrandReassignAllowed({ scopedBrandIds, brandIdProvided: brandId !== undefined });
  if (brandId !== undefined) await assertBrandBelongsToCompany({ brandId, companyId });
  const nextBrandId = brandId !== undefined ? brandId || null : policy.brandId;

  if (rosterGroupIds !== undefined) {
    await assertRosterGroupsBelongToCompany(rosterGroupIds, companyId, nextBrandId);
    await assertNoLeaveTypeConflict({
      companyId,
      brandId: nextBrandId,
      leaveTypeId: policy.leaveTypeId,
      rosterGroupIds,
      excludePolicyId: id,
    });
  } else if (brandId !== undefined) {
    // brandId alone is changing — only a "default" (zero Roster links)
    // policy needs re-checking against its new (brand, leaveType) slot; a
    // Roster-scoped override's conflict key doesn't involve brandId at all.
    const existingLinks = await db.RosterGroupLeavePolicy.findAll({ where: { leavePolicyId: id }, attributes: ['id'] });
    if (existingLinks.length === 0) {
      await assertNoLeaveTypeConflict({
        companyId,
        brandId: nextBrandId,
        leaveTypeId: policy.leaveTypeId,
        rosterGroupIds: [],
        excludePolicyId: id,
      });
    }
  }

  const quotaPatch =
    annualQuota !== undefined || isUnlimited !== undefined
      ? await resolveQuota({
          companyId,
          leaveTypeId: policy.leaveTypeId,
          annualQuota: annualQuota !== undefined ? annualQuota : policy.annualQuota,
          isUnlimited: isUnlimited !== undefined ? isUnlimited : policy.isUnlimited,
        })
      : {};

  await policy.update({
    ...quotaPatch,
    ...(accrual !== undefined && { accrual }),
    ...(applicableAfterDays !== undefined && { applicableAfterDays }),
    ...(brandId !== undefined && { brandId: nextBrandId }),
  });

  if (rosterGroupIds !== undefined) await syncLeavePolicyRosterGroups(id, policy.leaveTypeId, rosterGroupIds);
  return db.LeavePolicy.findOne({ where: { id }, include: READ_INCLUDES });
}

module.exports = { listLeavePolicies, getLeavePolicyForWrite, createLeavePolicy, updateLeavePolicy };
