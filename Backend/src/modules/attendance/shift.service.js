'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { assertRosterGroupsBelongToCompany } = require('../../utils/rosterGroupAssignment');
const { syncWeekOffLeaveForRosterGroup } = require('../leave/weekOffLeave.service');
const {
  resolveCreateBrandId,
  assertBrandBelongsToCompany,
  applyBrandListScope,
  assertBrandWriteScope,
  assertBrandReassignAllowed,
} = require('../../utils/brandScope');
const { crossesMidnight } = require('../../utils/shiftTime');

async function listShifts({ companyId, brandId, scopedBrandIds, limit, offset }) {
  // Shift's tenant-scope hook already filters by company_id for a scoped
  // caller; the explicit where only matters for Super Admin (hook is a
  // no-op when the caller's own companyId is null).
  const where = companyId ? { companyId } : {};
  applyBrandListScope(where, { brandId, scopedBrandIds });

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

async function getShiftForWrite({ companyId, id, scopedBrandIds }) {
  const shift = await db.Shift.findOne({ where: { id, companyId } });
  if (!shift) throw new HttpError(404, 'Shift not found');
  assertBrandWriteScope({ scopedBrandIds, recordBrandId: shift.brandId });
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

// Best-effort, logged-not-thrown — a bug in this side effect must never
// block saving the Shift/Roster assignment itself. Shared by
// syncShiftRosterGroups (a Roster newly linked to this Shift) and
// updateShift (an already-linked Roster whose Shift's Week Off Leave config
// just changed, with rosterGroupIds itself untouched this call).
async function provisionWeekOffLeaveForRosterGroups(shift, rosterGroupIds) {
  for (const rosterGroupId of rosterGroupIds) {
    try {
      await syncWeekOffLeaveForRosterGroup({
        rosterGroupId,
        companyId: shift.companyId,
        weeklyOffDays: shift.weeklyOffDays,
        weekOffLeaveEnabled: shift.weekOffLeaveEnabled,
        weekOffLeaveBasisDays: shift.weekOffLeaveBasisDays,
      });
    } catch (err) {
      console.error('Week Off Leaves provisioning failed for roster group', rosterGroupId, err);
    }
  }
}

// `shift` (not just its id) is needed so the eager Week Off Leaves
// provisioning above has companyId/weeklyOffDays/weekOffLeaveEnabled/
// weekOffLeaveBasisDays without a re-query — a Roster Group newly linked to
// a no-weekly-off, Week-Off-Leave-enabled Shift gets its balance seeded
// immediately here, rather than waiting for weekOffLeaveAccrual.job.js's
// next monthly run.
async function syncShiftRosterGroups(shift, rosterGroupIds) {
  await db.RosterGroupShift.destroy({ where: { shiftId: shift.id } });
  if (rosterGroupIds && rosterGroupIds.length > 0) {
    await db.RosterGroupShift.bulkCreate(rosterGroupIds.map((rosterGroupId) => ({ shiftId: shift.id, rosterGroupId })));
    await provisionWeekOffLeaveForRosterGroups(shift, rosterGroupIds);
  }
}

// Only meaningful when weeklyOffDays is empty — otherwise the whole Week Off
// Leave choice never applied (a Shift with real weekly-off days doesn't need
// a substitute), so it's always forced back to "not configured". When
// weeklyOffDays IS empty, the admin's choice is explicit: weekOffLeaveEnabled
// must be true/false (missing/undefined defaults to false — "No" — same as
// if the admin dismissed the prompt without opting in), and true requires at
// least one basis day picked.
function normalizeWeekOffLeaveConfig({ weeklyOffDays, weekOffLeaveEnabled, weekOffLeaveBasisDays }) {
  if (weeklyOffDays.length > 0) {
    return { weekOffLeaveEnabled: null, weekOffLeaveBasisDays: [] };
  }

  const enabled = !!weekOffLeaveEnabled;
  if (!enabled) {
    return { weekOffLeaveEnabled: false, weekOffLeaveBasisDays: [] };
  }

  const basisDays = Array.isArray(weekOffLeaveBasisDays) ? [...new Set(weekOffLeaveBasisDays)] : [];
  if (basisDays.length === 0 || basisDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new HttpError(400, 'Select at least one day (0-6) for Week Off Leave, or turn it off');
  }
  return { weekOffLeaveEnabled: true, weekOffLeaveBasisDays: basisDays.sort((a, b) => a - b) };
}

// Timing (startTime/endTime) is free to repeat across shifts — e.g. two
// differently-named shifts covering the same hours for different teams is a
// legitimate setup. Only the name has to be unique per company, case-
// insensitively, so "Morning" and "morning" can't coexist. Scoped to
// currently-visible rows only (paranoid soft-delete default scope already
// excludes deleted_at rows) — a deleted shift's old name doesn't block reuse,
// matching the DB partial unique index below.
async function assertShiftNameFree({ companyId, name, currentShiftId }) {
  const existing = await db.Shift.findOne({
    where: {
      companyId,
      [Op.and]: db.sequelize.where(db.sequelize.fn('lower', db.sequelize.col('name')), name.trim().toLowerCase()),
      ...(currentShiftId ? { id: { [Op.ne]: currentShiftId } } : {}),
    },
  });
  if (existing) throw new HttpError(409, `A shift named "${name}" already exists`);
}

async function createShift({
  companyId,
  brandId,
  scopedBrandIds,
  name,
  startTime,
  endTime,
  weeklyOffDays,
  weekOffLeaveEnabled,
  weekOffLeaveBasisDays,
  rosterGroupIds,
}) {
  const resolvedBrandId = resolveCreateBrandId({ brandId, scopedBrandIds });
  await assertBrandBelongsToCompany({ brandId: resolvedBrandId, companyId });
  await assertShiftNameFree({ companyId, name });
  await assertRosterGroupsBelongToCompany(rosterGroupIds, companyId, resolvedBrandId);
  await assertRosterGroupsShiftFree(rosterGroupIds, null);

  const normalizedWeeklyOffDays = Array.isArray(weeklyOffDays) ? weeklyOffDays : [];
  const weekOffLeaveConfig = normalizeWeekOffLeaveConfig({
    weeklyOffDays: normalizedWeeklyOffDays,
    weekOffLeaveEnabled,
    weekOffLeaveBasisDays,
  });

  const shift = await db.Shift.create({
    companyId,
    brandId: resolvedBrandId,
    name,
    startTime,
    endTime,
    // Derived from the hours, never trusted from the client — see
    // utils/shiftTime.js::crossesMidnight.
    isNightShift: crossesMidnight(startTime, endTime),
    weeklyOffDays: normalizedWeeklyOffDays,
    ...weekOffLeaveConfig,
  });

  if (rosterGroupIds !== undefined) await syncShiftRosterGroups(shift, rosterGroupIds);
  return getShiftForRead(shift.id);
}

async function updateShift({ companyId, id, updates, scopedBrandIds }) {
  const shift = await getShiftForWrite({ companyId, id, scopedBrandIds });
  const {
    name,
    startTime,
    endTime,
    weeklyOffDays,
    weekOffLeaveEnabled,
    weekOffLeaveBasisDays,
    rosterGroupIds,
    brandId,
  } = updates;

  assertBrandReassignAllowed({ scopedBrandIds, brandIdProvided: brandId !== undefined });
  if (brandId !== undefined) await assertBrandBelongsToCompany({ brandId, companyId });
  const nextBrandId = brandId !== undefined ? brandId || null : shift.brandId;

  if (name !== undefined) await assertShiftNameFree({ companyId, name, currentShiftId: id });

  if (rosterGroupIds !== undefined) {
    await assertRosterGroupsBelongToCompany(rosterGroupIds, companyId, nextBrandId);
    await assertRosterGroupsShiftFree(rosterGroupIds, id);
  }

  // Re-normalized whenever any of the three related fields is touched — a
  // partial update (e.g. only weeklyOffDays changing back to non-empty)
  // still needs the other two forced back to "not configured", and toggling
  // weekOffLeaveEnabled alone still needs the shift's OWN weeklyOffDays (not
  // touched this call) to decide whether the choice even applies.
  const weekOffTouched =
    weeklyOffDays !== undefined || weekOffLeaveEnabled !== undefined || weekOffLeaveBasisDays !== undefined;
  const weekOffLeaveConfig = weekOffTouched
    ? normalizeWeekOffLeaveConfig({
        weeklyOffDays: weeklyOffDays !== undefined ? weeklyOffDays : shift.weeklyOffDays,
        weekOffLeaveEnabled: weekOffLeaveEnabled !== undefined ? weekOffLeaveEnabled : shift.weekOffLeaveEnabled,
        weekOffLeaveBasisDays:
          weekOffLeaveBasisDays !== undefined ? weekOffLeaveBasisDays : shift.weekOffLeaveBasisDays,
      })
    : null;

  await shift.update({
    ...(name !== undefined && { name }),
    ...(startTime !== undefined && { startTime }),
    ...(endTime !== undefined && { endTime }),
    ...((startTime !== undefined || endTime !== undefined) && {
      isNightShift: crossesMidnight(startTime ?? shift.startTime, endTime ?? shift.endTime),
    }),
    ...(weeklyOffDays !== undefined && { weeklyOffDays }),
    ...(weekOffLeaveConfig ?? {}),
    ...(brandId !== undefined && { brandId: brandId || null }),
  });

  if (rosterGroupIds !== undefined) {
    await syncShiftRosterGroups(shift, rosterGroupIds);
  } else if (weekOffTouched) {
    // Roster assignments weren't touched this call, but the Week Off Leave
    // config was — re-provision for whichever Roster Groups are already
    // linked to this Shift so a config change (e.g. flipping Yes -> No, or
    // changing the basis days) takes effect immediately rather than waiting
    // for the monthly sweep.
    const links = await db.RosterGroupShift.findAll({ where: { shiftId: shift.id }, attributes: ['rosterGroupId'] });
    if (links.length > 0) {
      await provisionWeekOffLeaveForRosterGroups(shift, links.map((l) => l.rosterGroupId));
    }
  }

  return getShiftForRead(id);
}

async function deleteShift({ companyId, id, scopedBrandIds }) {
  const shift = await getShiftForWrite({ companyId, id, scopedBrandIds });

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
