'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

// Roster Group's own page ("Roster") no longer assigns Shifts/Holidays/
// Company Policies/Leave Policies to itself — those are all assigned from
// each entity's OWN create/edit form ("Assign to Roster(s)"). This read
// include is purely informational, for the Roster detail view's read-only
// summary tabs.
const LINKED_ENTITY_INCLUDES = [
  { model: db.Shift, as: 'shifts', through: { attributes: [] } },
  { model: db.Holiday, as: 'holidays', through: { attributes: [] } },
  { model: db.CompanyPolicy, as: 'companyPolicies', through: { attributes: [] } },
  {
    model: db.LeavePolicy,
    as: 'leavePolicies',
    through: { attributes: [] },
    include: [{ model: db.LeaveType, as: 'leaveType' }],
  },
];

async function listRosterGroups({ companyId, limit, offset }) {
  const where = companyId ? { companyId } : {};

  const { rows, count } = await db.RosterGroup.findAndCountAll({
    where,
    limit,
    offset,
    order: [['name', 'ASC']],
  });
  return { rows, count };
}

async function getRosterGroupForRead(id) {
  const rosterGroup = await db.RosterGroup.findOne({
    where: { id },
    include: LINKED_ENTITY_INCLUDES,
  });
  if (!rosterGroup) throw new HttpError(404, 'Roster Group not found');
  return rosterGroup;
}

async function getRosterGroupForWrite({ companyId, id }) {
  const rosterGroup = await db.RosterGroup.findOne({ where: { id, companyId } });
  if (!rosterGroup) throw new HttpError(404, 'Roster Group not found');
  return rosterGroup;
}

async function createRosterGroup({ companyId, name, description, createdBy }) {
  return db.RosterGroup.create({
    companyId,
    name,
    description: description || null,
    createdBy: createdBy || null,
  });
}

async function updateRosterGroup({ companyId, id, updates, updatedBy }) {
  const rosterGroup = await getRosterGroupForWrite({ companyId, id });
  const { name, description } = updates;

  await rosterGroup.update({
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    updatedBy: updatedBy || null,
  });

  return rosterGroup;
}

// Delete guard (409): a Roster Group with any dependents (assigned
// employees, or anything still linked via the roster_group_* join tables)
// can't be deleted — the admin must unassign those first. `onDelete:
// 'CASCADE'` on the join tables' FKs would otherwise silently drop those
// links, which is why this guard — not the DB cascade — is the real
// enforcement, same convention as deleteDepartment/deleteShift.
async function deleteRosterGroup({ companyId, id }) {
  const rosterGroup = await getRosterGroupForWrite({ companyId, id });

  const [employeeCount, shiftCount, holidayCount, companyPolicyCount, leavePolicyCount] = await Promise.all([
    db.Employee.count({ where: { rosterGroupId: id, companyId } }),
    db.RosterGroupShift.count({ where: { rosterGroupId: id } }),
    db.RosterGroupHoliday.count({ where: { rosterGroupId: id } }),
    db.RosterGroupCompanyPolicy.count({ where: { rosterGroupId: id } }),
    db.RosterGroupLeavePolicy.count({ where: { rosterGroupId: id } }),
  ]);
  if (employeeCount > 0) {
    throw new HttpError(409, `Cannot delete Roster: ${employeeCount} employee(s) still assigned`);
  }
  if (shiftCount > 0) {
    throw new HttpError(409, `Cannot delete Roster: a Shift is still assigned to it`);
  }
  if (holidayCount > 0) {
    throw new HttpError(409, `Cannot delete Roster: ${holidayCount} holiday(s) still assigned to it`);
  }
  if (companyPolicyCount > 0) {
    throw new HttpError(409, `Cannot delete Roster: ${companyPolicyCount} company polic(y/ies) still assigned to it`);
  }
  if (leavePolicyCount > 0) {
    throw new HttpError(409, `Cannot delete Roster: ${leavePolicyCount} leave polic(y/ies) still assigned to it`);
  }

  await rosterGroup.destroy();
}

// Assigns this Roster to several employees in one call. Per-employee errors
// (wrong company) are collected and skipped rather than aborting the whole
// batch, same shape as shiftRoster.service.js::bulkCreateShiftRoster.
async function bulkAssignRosterGroup({ companyId, id, employeeIds }) {
  await getRosterGroupForWrite({ companyId, id });

  const results = [];
  for (const employeeId of employeeIds) {
    const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
    if (!employee) {
      results.push({ employeeId, status: 'skipped', reason: 'Employee not found for this company' });
      continue;
    }
    await employee.update({ rosterGroupId: id });
    results.push({ employeeId, status: 'assigned' });
  }
  return results;
}

module.exports = {
  listRosterGroups,
  getRosterGroupForRead,
  createRosterGroup,
  updateRosterGroup,
  deleteRosterGroup,
  bulkAssignRosterGroup,
};
