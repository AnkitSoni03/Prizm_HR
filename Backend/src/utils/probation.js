'use strict';

const { addDays, dateOnly } = require('./dateRange');

// Whole calendar days from "today" (business-local) to dateStr — negative
// once dateStr is in the past.
function daysUntil(dateStr, asOf = new Date()) {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date(`${dateOnly(asOf)}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

// Employment types that are still "in a period" — reminders and the pop-up
// only run for these. Changing the employee to any other type (normally
// Full-time) is what ends tracking: there is no separate "confirm" action.
const PERIOD_EMPLOYMENT_TYPES = ['probation', 'intern'];

// Reminders start this many days before the period's last day and then
// repeat daily (past the end too) until the employment type is changed.
const REMINDER_LEAD_DAYS = 3;

const PERIOD_UNITS = ['days', 'months'];

// Calendar-month arithmetic, clamped to the target month's last day
// (Jan 31 + 1 month = Feb 28/29, not Mar 3).
function addMonths(dateStr, months) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return dateOnly(target);
}

// Last day of the period, DOJ counted as day 1: DOJ 2026-01-01 + 180 days
// ends 2026-06-29; DOJ 2026-10-10 + 6 months ends 2027-04-09.
// probationPeriodDays holds the length in probationPeriodUnit ('days' by
// default). null when either input is missing.
function computeProbationEndDate({ dateOfJoining, probationPeriodDays, probationPeriodUnit }) {
  if (!dateOfJoining || !probationPeriodDays) return null;
  if (probationPeriodUnit === 'months') {
    return addDays(addMonths(dateOfJoining, Number(probationPeriodDays)), -1);
  }
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
// otherwise a whole number between 1 and 3650 (days) / 120 (months).
function normalizeProbationPeriodDays(value, unit = 'days') {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const amount = Number(value);
  const max = unit === 'months' ? 120 : 3650;
  if (!Number.isInteger(amount) || amount < 1 || amount > max) return NaN;
  return amount;
}

function probationPeriodError(unit = 'days') {
  return unit === 'months'
    ? 'Probation / Intern period must be a whole number of months between 1 and 120'
    : 'Probation / Intern period must be a whole number of days between 1 and 3650';
}

module.exports = {
  PERIOD_EMPLOYMENT_TYPES,
  PERIOD_UNITS,
  REMINDER_LEAD_DAYS,
  addMonths,
  computeProbationEndDate,
  probationAlertFor,
  describeRemaining,
  periodLabel,
  formatDisplayDate,
  normalizeProbationPeriodDays,
  probationPeriodError,
};
