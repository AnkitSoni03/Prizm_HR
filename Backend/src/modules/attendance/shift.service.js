'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');

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
  });
  return { rows, count };
}

async function getShiftForRead(id) {
  const shift = await db.Shift.findOne({ where: { id } });
  if (!shift) throw new HttpError(404, 'Shift not found');
  return shift;
}

async function getShiftForWrite({ companyId, id }) {
  const shift = await db.Shift.findOne({ where: { id, companyId } });
  if (!shift) throw new HttpError(404, 'Shift not found');
  return shift;
}

async function createShift({ companyId, name, startTime, endTime, isNightShift, weeklyOffDays }) {
  return db.Shift.create({
    companyId,
    name,
    startTime,
    endTime,
    isNightShift: !!isNightShift,
    weeklyOffDays: Array.isArray(weeklyOffDays) ? weeklyOffDays : [],
  });
}

async function updateShift({ companyId, id, updates }) {
  const shift = await getShiftForWrite({ companyId, id });
  const { name, startTime, endTime, isNightShift, weeklyOffDays } = updates;

  await shift.update({
    ...(name !== undefined && { name }),
    ...(startTime !== undefined && { startTime }),
    ...(endTime !== undefined && { endTime }),
    ...(isNightShift !== undefined && { isNightShift }),
    ...(weeklyOffDays !== undefined && { weeklyOffDays }),
  });
  return shift;
}

async function deleteShift({ companyId, id }) {
  const shift = await getShiftForWrite({ companyId, id });

  const [assignmentCount, rosterCount] = await Promise.all([
    db.EmployeeShift.count({ where: { shiftId: id } }),
    db.ShiftRoster.count({ where: { shiftId: id } }),
  ]);
  if (assignmentCount > 0 || rosterCount > 0) {
    throw new HttpError(409, 'Cannot delete shift: still referenced by employee shifts or roster entries');
  }

  await shift.destroy();
}

module.exports = { listShifts, getShiftForRead, createShift, updateShift, deleteShift };
