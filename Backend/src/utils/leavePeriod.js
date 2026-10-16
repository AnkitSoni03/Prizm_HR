'use strict';

const { addDays } = require('./dateRange');
const { PERIOD_EMPLOYMENT_TYPES, computeProbationEndDate, addMonths } = require('./probation');

// Which leave "period" a date falls in for an employee — the unit a
// year-grain leave_balances row covers (period_start / period_end):
//
//   - 'probation': the employee is (or, for a date before confirmedOn, was)
//     in a Probation/Intern period with a configured length. One period
//     from DOJ until they're confirmed — it does NOT renew on the yearly
//     cycle date, however long it runs. periodEnd is null while it's still
//     running (an Intern kept on past their planned end just stays in it).
//     The quota is prorated over the PLANNED length (DOJ → computed end).
//
//   - 'cycle': the yearly "Yearly Roster Update" cycle (company default,
//     employee override), starting on the 1st of cycleStartMonth. A cycle
//     the employee joined or was confirmed inside starts on that day
//     instead, and its quota is prorated from there.
//
// Pure — no DB access.

const pad = (n) => String(n).padStart(2, '0');

// 1-12, or null for anything else ('' / null clear an override).
function normalizeCycleStartMonth(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return NaN;
  return month;
}

function effectiveCycleStartMonth({ employee, company }) {
  return Number(employee?.yearlyCycleStartMonth) || Number(company?.yearlyCycleStartMonth) || 1;
}

// The yearly cycle containing dateStr.
function cycleFor(dateStr, cycleStartMonth) {
  const [y, m] = String(dateStr).split('-').map(Number);
  const startYear = m >= cycleStartMonth ? y : y - 1;
  const cycleStart = `${startYear}-${pad(cycleStartMonth)}-01`;
  return { cycleStart, cycleEnd: addDays(addMonths(cycleStart, 12), -1) };
}

function hasProbationPeriod(employee) {
  return Boolean(employee?.dateOfJoining && employee?.probationPeriodDays);
}

function isInProbationPeriod(employee) {
  return PERIOD_EMPLOYMENT_TYPES.includes(employee?.employmentType) && hasProbationPeriod(employee);
}

// accrualEnd is the last day the quota is prorated up to (null = no fixed
// end: monthly accrual just keeps going).
function resolveLeavePeriod({ employee, cycleStartMonth, dateStr }) {
  const doj = employee.dateOfJoining || null;

  if (isInProbationPeriod(employee)) {
    return {
      kind: 'probation',
      periodStart: doj,
      periodEnd: null,
      accrualEnd: computeProbationEndDate(employee),
      cycleStartMonth,
    };
  }

  const confirmedOn = employee.confirmedOn || null;
  if (confirmedOn && doj && dateStr >= doj && dateStr < confirmedOn) {
    const lastProbationDay = addDays(confirmedOn, -1);
    return { kind: 'probation', periodStart: doj, periodEnd: lastProbationDay, accrualEnd: lastProbationDay, cycleStartMonth };
  }

  const { cycleStart, cycleEnd } = cycleFor(dateStr, cycleStartMonth);
  let periodStart = cycleStart;
  for (const start of [doj, confirmedOn]) {
    if (start && start > periodStart && start <= cycleEnd) periodStart = start;
  }
  return { kind: 'cycle', periodStart, periodEnd: cycleEnd, accrualEnd: cycleEnd, cycleStartMonth, cycleStart, cycleEnd };
}

function daysInclusive(from, to) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

// Yearly quota for a period: the full quota for a whole cycle, otherwise
// prorated by days (rounded to the nearest 0.5) — e.g. 12/year over a
// 180-day probation = 6, over 11 Apr–31 Dec = 8.5.
function prorateYearlyQuota({ quota, period }) {
  const full = Number(quota);
  if (!period.accrualEnd) return full;
  const { cycleStart, cycleEnd } = cycleFor(period.periodStart, period.cycleStartMonth);
  const cycleDays = daysInclusive(cycleStart, cycleEnd);
  const covered = daysInclusive(period.periodStart, period.accrualEnd);
  if (covered <= 0) return 0;
  if (covered === cycleDays) return full;
  return Math.round(((full * covered) / cycleDays) * 2) / 2;
}

// Whole months credited so far in a period (monthly accrual): every calendar
// month from the period's first month up to asOf (or the period's end, if
// earlier — a still-running probation period has none, so an Intern kept on
// past their planned end keeps accruing). A joiner's first month counts in
// full (unchanged rule);
// a period that continues an earlier one mid-month (confirmed on the 11th)
// starts with the next month, since the earlier period already credited it.
function monthsAccruedInPeriod({ period, dateOfJoining, asOf }) {
  let from = period.periodStart;
  if (from && !from.endsWith('-01') && from !== dateOfJoining) {
    from = addMonths(`${from.slice(0, 7)}-01`, 1);
  }
  let until = asOf;
  if (period.periodEnd && period.periodEnd < until) until = period.periodEnd;
  if (!from || until < from) return 0;
  const [fy, fm] = from.split('-').map(Number);
  const [uy, um] = until.split('-').map(Number);
  return Math.max(0, (uy - fy) * 12 + (um - fm) + 1);
}

module.exports = {
  normalizeCycleStartMonth,
  effectiveCycleStartMonth,
  cycleFor,
  hasProbationPeriod,
  isInProbationPeriod,
  resolveLeavePeriod,
  prorateYearlyQuota,
  monthsAccruedInPeriod,
};
