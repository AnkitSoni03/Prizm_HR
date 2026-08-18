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
    const { rows, count } = await db.LeaveType.findAndCountAll({
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

async function createLeaveType({
  companyId,
  code,
  name,
  isPaid,
  carryForward,
  maxCarryForwardDays,
  cycleType,
  defaultAccrual,
}) {
  try {
    return await db.LeaveType.create({
      companyId,
      code,
      name,
      isPaid: isPaid !== undefined ? !!isPaid : true,
      carryForward: !!carryForward,
      maxCarryForwardDays: carryForward && maxCarryForwardDays !== undefined ? maxCarryForwardDays : null,
      cycleType: cycleType || 'calendar',
      defaultAccrual: defaultAccrual || null,
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
  const { name, isPaid, carryForward, maxCarryForwardDays, cycleType, defaultAccrual } = updates;

  await leaveType.update({
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
  });
  return leaveType;
}

// Blocked (409) once real usage exists (a balance or a request) — that's
// history, never destroyed. Any Leave Policy configuration for this type is
// necessarily unused if we get past that check (a policy can't produce a
// balance/request without accruing/being applied for), so it's safe to
// clean up automatically here rather than leaving orphaned config behind —
// leave_policies has no delete route of its own today.
async function deleteLeaveType({ companyId, id }) {
  const leaveType = await getLeaveTypeForWrite({ companyId, id });

  const [balanceCount, requestCount] = await Promise.all([
    db.LeaveBalance.count({ where: { leaveTypeId: id } }),
    db.LeaveRequest.count({ where: { leaveTypeId: id } }),
  ]);
  if (balanceCount > 0) {
    throw new HttpError(409, 'Cannot delete: employees already have a leave balance for this type.');
  }
  if (requestCount > 0) {
    throw new HttpError(409, 'Cannot delete: leave requests already exist for this type.');
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
