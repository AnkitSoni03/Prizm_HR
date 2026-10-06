'use strict';

const { addDays } = require('./dateRange');
const { daysUntil } = require('./rosterValidity');

// Employment types that are still "in a period" — reminders and the pop-up
// only run for these. Changing the employee to any other type (normally
// Full-time) is what ends tracking: there is no separate "confirm" action.
const PERIOD_EMPLOYMENT_TYPES = ['probation', 'intern'];

// Reminders start this many days before the period's last day and then
// repeat daily (past the end too) until the employment type is changed.
const REMINDER_LEAD_DAYS = 3;

// Last day of the period, DOJ counted as day 1: DOJ 2026-01-01 + 180 days
// ends 2026-06-29. null when either input is missing.
function computeProbationEndDate({ dateOfJoining, probationPeriodDays }) {
  if (!dateOfJoining || !probationPeriodDays) return null;
  return addDays(dateOfJoining, Number(probationPeriodDays) - 1);
}

// The reminder/pop-up view of one employee, or null when they aren't due —
// not in a period type, no DOJ/period set, or more than REMINDER_LEAD_DAYS
// away from the end.
function probationAlertFor(employee, asOf = new Date()) {
  if (!PERIOD_EMPLOYMENT_TYPES.includes(employee.employmentType)) return null;
  const endDate = computeProbationEndDate(employee);
  if (!endDate) return null;
  const daysRemaining = daysUntil(endDate, asOf);
  if (daysRemaining > REMINDER_LEAD_DAYS) return null;
  return { endDate, daysRemaining };
}

// "ends in 3 days" / "ends tomorrow" / "ends today" / "ended 2 days ago".
function describeRemaining(daysRemaining) {
  if (daysRemaining > 1) return `ends in ${daysRemaining} days`;
  if (daysRemaining === 1) return 'ends tomorrow';
  if (daysRemaining === 0) return 'ends today';
  if (daysRemaining === -1) return 'ended yesterday';
  return `ended ${-daysRemaining} days ago`;
}

// DD/MM/YYYY, matching the frontend's formatDisplayDate — notification text
// is shown as-is.
function formatDisplayDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-');
  return `${d}/${m}/${y}`;
}

function periodLabel(employmentType) {
  return employmentType === 'intern' ? 'internship period' : 'probation period';
}

// Throws-free validation shared by create and update: null/'' clears it,
// otherwise a whole number of days between 1 and 3650.
function normalizeProbationPeriodDays(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return NaN;
  return days;
}

module.exports = {
  PERIOD_EMPLOYMENT_TYPES,
  REMINDER_LEAD_DAYS,
  computeProbationEndDate,
  probationAlertFor,
  describeRemaining,
  periodLabel,
  formatDisplayDate,
  normalizeProbationPeriodDays,
};
