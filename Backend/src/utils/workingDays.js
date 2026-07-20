'use strict';

const { Op } = require('sequelize');
const db = require('../models');

function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

// A company/brand holiday for this date — brand-specific rows and
// company-wide rows (brand_id NULL) both apply.
async function isHoliday({ companyId, brandId, dateStr }) {
  const holiday = await db.Holiday.findOne({
    where: {
      companyId,
      date: dateStr,
      [Op.or]: [{ brandId: null }, ...(brandId ? [{ brandId }] : [])],
    },
  });
  return !!holiday;
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
async function isWorkingDay({ employeeId, companyId, brandId, dateStr }) {
  if (await isHoliday({ companyId, brandId, dateStr })) return false;
  if (await isWeeklyOff({ employeeId, dateStr })) return false;
  return true;
}

module.exports = { isWorkingDay, isHoliday, isWeeklyOff };
