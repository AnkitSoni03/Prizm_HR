'use strict';

// Count of dates in a given calendar month whose day-of-week is in
// `daysOfWeek` (0=Sunday..6=Saturday, e.g. [0] for Sunday-only, [0,6] for
// Sat+Sun), optionally starting from a specific day-of-month (inclusive)
// instead of day 1 — the auxiliary case computeWeekOffQuota below uses to
// prorate a new joiner's first month. `month` is 1-12. Generalizes what used
// to be a hardcoded Sunday-only count, now that a Shift's admin can pick any
// combination of days as the Week Off Leave basis.
function countDaysInMonth(year, month, daysOfWeek, fromDay = 1) {
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) return 0;
  const daySet = new Set(daysOfWeek);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = fromDay; day <= daysInMonth; day++) {
    if (daySet.has(new Date(year, month - 1, day).getDay())) count += 1;
  }
  return count;
}

// The actual monthly quota for one employee's "Week Off Leaves" balance —
// the whole month's basisDays count normally, but for the specific month an
// employee JOINED in, only basisDays occurrences from their own joining date
// onward (a mid-month joiner shouldn't be credited for days before they
// existed). Every month after the joining month is unaffected — fromDay
// stays 1, the plain whole-month count. Single source of truth for this
// math, shared by leaveBalance.service.js::computeAllottedForPolicy (the
// balance-creation path) and weekOffLeave.service.js::syncWeekOffLeaveForRosterGroup
// (the monthly/eager provisioning sweep) so the two can never disagree.
function computeWeekOffQuota({ year, month, dateOfJoining, basisDays }) {
  let fromDay = 1;
  if (dateOfJoining) {
    const joinDate = new Date(`${dateOfJoining}T00:00:00`);
    if (joinDate.getFullYear() === year && joinDate.getMonth() + 1 === month) {
      fromDay = joinDate.getDate();
    }
  }
  return countDaysInMonth(year, month, basisDays, fromDay);
}

module.exports = { countDaysInMonth, computeWeekOffQuota };
