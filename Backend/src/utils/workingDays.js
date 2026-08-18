'use strict';

const { Op } = require('sequelize');
const db = require('../models');

function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

// A Roster-scoped holiday covering this date. A holiday is a date range
// (date..endDate, inclusive — a single-day holiday just has date === endDate),
// so this checks containment, not an exact match. Roster is now the SOLE
// determinant of which holidays apply to an employee — an employee with no
// Roster assigned gets none at all (every day is a working day for them,
// including LOP/comp-off math, until a Roster is assigned), and once
// assigned, only holidays explicitly linked to THAT Roster apply; a holiday
// with zero Roster links is dormant (a catalog entry an admin hasn't
// attached to any Roster yet), not a "company-wide" fallback anymore. brandId
// still narrows within that: a matching holiday row must ALSO satisfy
// "brand-wide-or-this-brand". Roster scoping is a many-to-many join
// (roster_group_holidays), not a column, so this findAll-then-filter-in-JS
// shape (rather than a pure SQL WHERE) is needed to inspect each candidate's
// linked Rosters — holidays matching a given date are always few, so this is
// cheap.
async function isHoliday({ companyId, brandId, rosterGroupId, dateStr }) {
  if (!rosterGroupId) return false;

  const holidays = await db.Holiday.findAll({
    where: {
      companyId,
      date: { [Op.lte]: dateStr },
      endDate: { [Op.gte]: dateStr },
      [Op.or]: [{ brandId: null }, ...(brandId ? [{ brandId }] : [])],
    },
    include: [{ model: db.RosterGroup, as: 'rosterGroups', through: { attributes: [] }, attributes: ['id'] }],
  });
  return holidays.some((h) => h.rosterGroups.some((rg) => String(rg.id) === String(rosterGroupId)));
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
