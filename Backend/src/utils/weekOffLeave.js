'use strict';

// Count of Sundays in a given calendar month, optionally starting from a
// specific day-of-month (inclusive) instead of day 1 — the auxiliary case
// computeWeekOffQuota below uses to prorate a new joiner's first month.
// `month` is 1-12.
function countSundaysInMonth(year, month, fromDay = 1) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = fromDay; day <= daysInMonth; day++) {
    if (new Date(year, month - 1, day).getDay() === 0) count += 1;
  }
  return count;
}

// The actual monthly quota for one employee's "Week Off Leaves" balance —
// the whole month's Sunday count normally, but for the specific month an
// employee JOINED in, only Sundays from their own joining date onward (a
// mid-month joiner shouldn't be credited for Sundays before they existed).
// Every month after the joining month is unaffected — fromDay stays 1, the
// plain whole-month count. Single source of truth for this math, shared by
// leaveBalance.service.js::computeAllottedForPolicy (the balance-creation
// path) and weekOffLeave.service.js::syncWeekOffLeaveForRosterGroup (the
// monthly/eager provisioning sweep) so the two can never disagree.
function computeWeekOffQuota({ year, month, dateOfJoining }) {
  let fromDay = 1;
  if (dateOfJoining) {
    const joinDate = new Date(`${dateOfJoining}T00:00:00`);
    if (joinDate.getFullYear() === year && joinDate.getMonth() + 1 === month) {
      fromDay = joinDate.getDate();
    }
  }
  return countSundaysInMonth(year, month, fromDay);
}

module.exports = { countSundaysInMonth, computeWeekOffQuota };
