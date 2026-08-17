'use strict';

const { Op } = require('sequelize');
const db = require('../models');

function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

// A company/brand/Roster holiday covering this date. A holiday is a date
// range (date..endDate, inclusive — a single-day holiday just has date ===
// endDate), so this checks containment, not an exact match. brandId and
// rosterGroupId are two independent scoping dimensions: a matching holiday
// row must satisfy BOTH "brand-wide-or-this-brand" AND "Roster-wide-or-this-
// Roster" — so a Roster-scoped holiday (e.g. extra Durga Puja days assigned
// to a Kolkata Roster) only fires for that Roster's employees, while a plain
// company-wide holiday (brandId null, no Roster links) still fires for
// everyone. Roster scoping is a many-to-many join (roster_group_holidays),
// not a column, so this findAll-then-filter-in-JS shape (rather than a pure
// SQL WHERE) is needed to inspect each candidate's linked Rosters — holidays
// matching a given date are always few, so this is cheap.
async function isHoliday({ companyId, brandId, rosterGroupId, dateStr }) {
  const holidays = await db.Holiday.findAll({
    where: {
      companyId,
      date: { [Op.lte]: dateStr },
      endDate: { [Op.gte]: dateStr },
      [Op.or]: [{ brandId: null }, ...(brandId ? [{ brandId }] : [])],
    },
    include: [{ model: db.RosterGroup, as: 'rosterGroups', through: { attributes: [] }, attributes: ['id'] }],
  });
  return holidays.some(
    (h) => h.rosterGroups.length === 0 || (rosterGroupId && h.rosterGroups.some((rg) => String(rg.id) === String(rosterGroupId)))
  );
}

// Weekly off per the employee's roster/shift for this date (shift_rosters
// overrides employee_shifts — CLAUDE.md rule 7, resolved by
// attendance.service.js's resolveShiftForDate, reused here rather than
// duplicated).
async function isWeeklyOff({ employeeId, dateStr }) {
  // Required lazily (not at module top-level) to break a circular require:
  // attendance.service.js -> compOff.service.js -> workingDays.js would
  // otherwise loop back here before attendance.service.js finishes
  // exporting resolveShiftForDate. Safe because this only runs at request
  // time, long after all modules have finished loading.
  const { resolveShiftForDate } = require('../modules/attendance/attendance.service');
  const shift = await resolveShiftForDate({ employeeId, dateStr });
  if (!shift || !shift.weeklyOffDays || shift.weeklyOffDays.length === 0) return false;
  return shift.weeklyOffDays.includes(dayOfWeek(dateStr));
}

// Shared by leave day-counting and comp-off auto-detection
// (PHASE4_MODELS.md: "reuse one shared 'is this a working day' utility").
async function isWorkingDay({ employeeId, companyId, brandId, rosterGroupId, dateStr }) {
  if (await isHoliday({ companyId, brandId, rosterGroupId, dateStr })) return false;
  if (await isWeeklyOff({ employeeId, dateStr })) return false;
  return true;
}

module.exports = { isWorkingDay, isHoliday, isWeeklyOff };
