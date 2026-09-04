'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

// rosterGroupId (singular) has three states, mirroring
// companyPolicy.service.js::listCompanyPolicies / holiday.service.js::
// listHolidays: undefined = no filter, every LeaveType (admin management
// pages — Leave Policy Settings, "Assign Leaves" power, etc., which all need
// the full catalog regardless of Roster); 'none' = the caller has no Roster
// assigned — nothing; a real id = only LeaveTypes with an applicable
// LeavePolicy linked to that Roster (via roster_group_leave_policies —
// leaveTypeId is denormalized onto that join row specifically for this kind
// of lookup, see rosterGroupLeavePolicy.js). Used by ESS's own "My Leave"/
// "My Leave Balance" pages so an employee only ever sees the leave types
// their own Roster actually grants — LeaveType itself has no Roster
// dimension of its own, applicability is entirely derived from whether a
// RosterGroupLeavePolicy link exists.
async function listLeaveTypes({ limit, offset, rosterGroupId }) {
  if (rosterGroupId === undefined) {
    // Relies on LeaveType's tenant-scope hook for company_id filtering.
    // System-generated "Carry Forward - <name>" bucket types (see
    // rosterTransfer.service.js) and the auto-provisioned "Week Off Leaves"
    // type (see weekOffLeave.service.js) are excluded from this general
    // catalog — neither is something an admin should be editing/reassigning
    // directly, only something an employee's own Roster ends up governing.
    const { rows, count } = await db.LeaveType.findAndCountAll({
      where: { isCarryForwardBucket: false, isWeekOffBucket: false },
      limit,
      offset,
      order: [['id', 'ASC']],
    });
    return { rows, count };
  }
  if (rosterGroupId === 'none') return { rows: [], count: 0 };

  const links = await db.RosterGroupLeavePolicy.findAll({
    where: { rosterGroupId },
    include: [{ model: db.LeaveType, as: 'leaveType' }],
    limit,
    offset,
  });
  const rows = links.map((link) => link.leaveType);
  return { rows, count: rows.length };
}

async function getLeaveTypeForRead(id) {
  const leaveType = await db.LeaveType.findOne({ where: { id } });
  if (!leaveType) throw new HttpError(404, 'Leave type not found');
  return leaveType;
}

async function getLeaveTypeForWrite({ companyId, id }) {
  const leaveType = await db.LeaveType.findOne({ where: { id, companyId } });
  if (!leaveType) throw new HttpError(404, 'Leave type not found');
  return leaveType;
}

// Validates a real day-for-month combination (rejects e.g. month=2/day=30)
// by round-tripping through Date and checking it didn't roll over into the
// next month — same class of bug flagged in CLAUDE.md's PT-slab-key
// mismatch note (a silent fallback here would be far worse: a wrong cycle
// boundary applied to every employee under this leave type, not just one
// state's slab).
function assertValidCustomCycleStart(month, day) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpError(400, 'customCycleStartMonth must be 1–12');
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new HttpError(400, 'customCycleStartDay must be 1–31');
  }
  const probe = new Date(2001, month - 1, day);
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    throw new HttpError(400, `${month}/${day} is not a valid date`);
  }
}

// Resolves the two customCycleStart columns from a cycleType + candidate
// values — shared by create (cycleType always has a real value, defaulted
// below) and update (cycleType may be omitted entirely, in which case the
// EXISTING type's cycleType decides whether these columns are relevant).
function resolveCustomCycleFields({ cycleType, customCycleStartMonth, customCycleStartDay }) {
  if (cycleType !== 'custom') {
    // Stale config left over from a previous 'custom' selection would be
    // misleading if the type is later switched to 'calendar'/'anniversary'
    // — same "clear it outright" precedent as maxCarryForwardDays when
    // carryForward turns false.
    return { customCycleStartMonth: null, customCycleStartDay: null };
  }
  assertValidCustomCycleStart(customCycleStartMonth, customCycleStartDay);
  return { customCycleStartMonth, customCycleStartDay };
}

async function createLeaveType({
  companyId,
  code,
  name,
  isPaid,
  carryForward,
  maxCarryForwardDays,
  cycleType,
  defaultAccrual,
  customCycleStartMonth,
  customCycleStartDay,
}) {
  const resolvedCycleType = cycleType || 'calendar';
  const customCycle = resolveCustomCycleFields({
    cycleType: resolvedCycleType,
    customCycleStartMonth,
    customCycleStartDay,
  });

  try {
    return await db.LeaveType.create({
      companyId,
      code,
      name,
      isPaid: isPaid !== undefined ? !!isPaid : true,
      carryForward: !!carryForward,
      maxCarryForwardDays: carryForward && maxCarryForwardDays !== undefined ? maxCarryForwardDays : null,
      cycleType: resolvedCycleType,
      defaultAccrual: defaultAccrual || null,
      ...customCycle,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new HttpError(409, 'code already in use for this company');
    }
    throw err;
  }
}

async function updateLeaveType({ companyId, id, updates }) {
  const leaveType = await getLeaveTypeForWrite({ companyId, id });
  const {
    name,
    isPaid,
    carryForward,
    maxCarryForwardDays,
    cycleType,
    defaultAccrual,
    customCycleStartMonth,
    customCycleStartDay,
  } = updates;

  const patch = {
    ...(name !== undefined && { name }),
    ...(isPaid !== undefined && { isPaid }),
    ...(carryForward !== undefined && { carryForward }),
    // Cap is only meaningful while carryForward is (or is becoming) true —
    // clear it outright if carryForward is explicitly turned off in the
    // same update, so a stale cap doesn't linger invisibly.
    ...(maxCarryForwardDays !== undefined && {
      maxCarryForwardDays: carryForward === false ? null : maxCarryForwardDays,
    }),
    ...(cycleType !== undefined && { cycleType }),
    ...(defaultAccrual !== undefined && { defaultAccrual }),
  };

  // Only re-resolve the custom-cycle columns when this update actually
  // touches the cycle dimension (cycleType itself, or a new month/day for
  // an already-'custom' type) — an unrelated field-only edit (e.g. name)
  // must leave an existing custom start date completely untouched.
  if (cycleType !== undefined || customCycleStartMonth !== undefined || customCycleStartDay !== undefined) {
    Object.assign(
      patch,
      resolveCustomCycleFields({
        cycleType: cycleType !== undefined ? cycleType : leaveType.cycleType,
        customCycleStartMonth: customCycleStartMonth !== undefined ? customCycleStartMonth : leaveType.customCycleStartMonth,
        customCycleStartDay: customCycleStartDay !== undefined ? customCycleStartDay : leaveType.customCycleStartDay,
      })
    );
  }

  await leaveType.update(patch);
  return leaveType;
}

// Blocked (409) once real usage exists (a balance or a request) — that's
// history, never destroyed. Any Leave Policy configuration for this type is
// necessarily unused if we get past that check (a policy can't produce a
// balance/request without accruing/being applied for), so it's safe to
// clean up automatically here rather than leaving orphaned config behind —
// leave_policies has no delete route of its own today.
//
// `force: true` (same `leave_type:delete` permission — no separate gate,
// same precedent as employee.service.js::assignEmployeePowers reusing an
// existing grant rather than adding a new code) lets an admin who has seen
// and accepted the consequences delete anyway. It never hard-deletes: the
// blocking LeaveBalance/LeaveRequest rows are soft-deleted (paranoid
// `.destroy()`, respecting CLAUDE.md rule 2) so the history is gone from
// every normal read path but is still recoverable at the DB layer, same
// as any other soft-deleted row in this app.
async function deleteLeaveType({ companyId, id, force = false }) {
  const leaveType = await getLeaveTypeForWrite({ companyId, id });

  const [balanceCount, requestCount] = await Promise.all([
    db.LeaveBalance.count({ where: { leaveTypeId: id } }),
    db.LeaveRequest.count({ where: { leaveTypeId: id } }),
  ]);

  if (!force) {
    if (balanceCount > 0) {
      throw new HttpError(409, 'Cannot delete: employees already have a leave balance for this type.');
    }
    if (requestCount > 0) {
      throw new HttpError(409, 'Cannot delete: leave requests already exist for this type.');
    }
  } else {
    if (balanceCount > 0) {
      await db.LeaveBalance.destroy({ where: { leaveTypeId: id } });
    }
    if (requestCount > 0) {
      await db.LeaveRequest.destroy({ where: { leaveTypeId: id } });
    }
  }

  const policies = await db.LeavePolicy.findAll({ where: { leaveTypeId: id }, attributes: ['id'] });
  const policyIds = policies.map((p) => p.id);
  if (policyIds.length > 0) {
    await db.RosterGroupLeavePolicy.destroy({ where: { leavePolicyId: policyIds } });
    await db.LeavePolicy.destroy({ where: { id: policyIds } });
  }

  await leaveType.destroy();
}

module.exports = {
  listLeaveTypes,
  getLeaveTypeForRead,
  getLeaveTypeForWrite,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
};
