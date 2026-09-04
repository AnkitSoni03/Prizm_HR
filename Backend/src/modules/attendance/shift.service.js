'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { assertRosterGroupsBelongToCompany } = require('../../utils/rosterGroupAssignment');
const { syncWeekOffLeaveForRosterGroup } = require('../leave/weekOffLeave.service');

async function listShifts({ companyId, limit, offset }) {
  // Shift's tenant-scope hook already filters by company_id for a scoped
  // caller; the explicit where only matters for Super Admin (hook is a
  // no-op when the caller's own companyId is null).
  const where = companyId ? { companyId } : {};

  const { rows, count } = await db.Shift.findAndCountAll({
    where,
    limit,
    offset,
    order: [['id', 'ASC']],
    include: [{ model: db.RosterGroup, as: 'rosterGroups', through: { attributes: [] } }],
  });
  return { rows, count };
}

async function getShiftForRead(id) {
  const shift = await db.Shift.findOne({
    where: { id },
    include: [{ model: db.RosterGroup, as: 'rosterGroups', through: { attributes: [] } }],
  });
  if (!shift) throw new HttpError(404, 'Shift not found');
  return shift;
}

async function getShiftForWrite({ companyId, id }) {
  const shift = await db.Shift.findOne({ where: { id, companyId } });
  if (!shift) throw new HttpError(404, 'Shift not found');
  return shift;
}

// A Roster Group can have at most one Shift (roster_group_shifts' unique
// index on roster_group_id alone) — an employee can only work one shift at a
// time, so a conflicting second assignment is rejected outright (409) rather
// than silently overwriting or picking a winner. currentShiftId is used on
// update, to allow re-saving the same Shift's own existing links without
// tripping over itself.
async function assertRosterGroupsShiftFree(rosterGroupIds, currentShiftId) {
  if (!rosterGroupIds || rosterGroupIds.length === 0) return;
  const existing = await db.RosterGroupShift.findAll({
    where: { rosterGroupId: rosterGroupIds },
    include: [{ model: db.RosterGroup, as: 'rosterGroup', attributes: ['name'] }],
  });
  const conflict = existing.find((link) => String(link.shiftId) !== String(currentShiftId));
  if (conflict) {
    throw new HttpError(
      409,
      `Roster "${conflict.rosterGroup.name}" already has a different Shift assigned — remove it there first`
    );
  }
}

// `shift` (not just its id) is needed so the eager Week Off Leaves
// provisioning below has companyId/weeklyOffDays without a re-query — a
// Roster Group newly linked to a Shift with no weekly-off day gets its
// "Week Off Leaves" balance seeded immediately here, rather than waiting for
// weekOffLeaveAccrual.job.js's next monthly run (see
// weekOffLeave.service.js::syncWeekOffLeaveForRosterGroup — a no-op when
// weeklyOffDays isn't empty, so this call is unconditional and harmless for
// every normal Shift). Best-effort, logged-not-thrown — a bug in this side
// effect must never block saving the Shift/Roster assignment itself.
async function syncShiftRosterGroups(shift, rosterGroupIds) {
  await db.RosterGroupShift.destroy({ where: { shiftId: shift.id } });
  if (rosterGroupIds && rosterGroupIds.length > 0) {
    await db.RosterGroupShift.bulkCreate(rosterGroupIds.map((rosterGroupId) => ({ shiftId: shift.id, rosterGroupId })));

    for (const rosterGroupId of rosterGroupIds) {
      try {
        await syncWeekOffLeaveForRosterGroup({
          rosterGroupId,
          companyId: shift.companyId,
          weeklyOffDays: shift.weeklyOffDays,
        });
      } catch (err) {
        console.error('Week Off Leaves provisioning failed for roster group', rosterGroupId, err);
      }
    }
  }
}

async function createShift({ companyId, name, startTime, endTime, isNightShift, weeklyOffDays, rosterGroupIds }) {
  await assertRosterGroupsBelongToCompany(rosterGroupIds, companyId);
  await assertRosterGroupsShiftFree(rosterGroupIds, null);

  const shift = await db.Shift.create({
    companyId,
    name,
    startTime,
    endTime,
    isNightShift: !!isNightShift,
    weeklyOffDays: Array.isArray(weeklyOffDays) ? weeklyOffDays : [],
  });

  if (rosterGroupIds !== undefined) await syncShiftRosterGroups(shift, rosterGroupIds);
  return getShiftForRead(shift.id);
}

async function updateShift({ companyId, id, updates }) {
  const shift = await getShiftForWrite({ companyId, id });
  const { name, startTime, endTime, isNightShift, weeklyOffDays, rosterGroupIds } = updates;

  if (rosterGroupIds !== undefined) {
    await assertRosterGroupsBelongToCompany(rosterGroupIds, companyId);
    await assertRosterGroupsShiftFree(rosterGroupIds, id);
  }

  await shift.update({
    ...(name !== undefined && { name }),
    ...(startTime !== undefined && { startTime }),
    ...(endTime !== undefined && { endTime }),
    ...(isNightShift !== undefined && { isNightShift }),
    ...(weeklyOffDays !== undefined && { weeklyOffDays }),
  });

  if (rosterGroupIds !== undefined) await syncShiftRosterGroups(shift, rosterGroupIds);
  return getShiftForRead(id);
}

async function deleteShift({ companyId, id }) {
  const shift = await getShiftForWrite({ companyId, id });

  const [assignmentCount, rosterCount, rosterGroupCount] = await Promise.all([
    db.EmployeeShift.count({ where: { shiftId: id } }),
    db.ShiftRoster.count({ where: { shiftId: id } }),
    db.RosterGroupShift.count({ where: { shiftId: id } }),
  ]);
  if (assignmentCount > 0 || rosterCount > 0 || rosterGroupCount > 0) {
    throw new HttpError(409, 'Cannot delete shift: still referenced by employee shifts, roster entries, or a Roster');
  }

  await shift.destroy();
}

module.exports = { listShifts, getShiftForRead, createShift, updateShift, deleteShift };
