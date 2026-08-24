'use strict';

const { dateOnly } = require('./dateRange');

// Resolves which "cycle" a given date falls into for a leave type, plus
// that cycle's own start/end dates. Three cycle types:
//
//   - 'calendar' (the only behavior that existed before this file did):
//     cycleKey is the plain calendar year, cycleStart/cycleEnd are Jan 1 /
//     Dec 31 of that year.
//   - 'anniversary': cycleKey is which "employment year" dateStr falls in,
//     counted from the employee's own dateOfJoining (year 1 = the twelve
//     months starting on their join date, year 2 = the next twelve months,
//     etc). Still a plain monotonically-increasing integer per employee, so
//     it slots into the existing `leave_balances.year` column with zero
//     schema change — two different employees each having their own
//     "cycle 2" never collides, since LeaveBalance is already uniquely
//     scoped by (employeeId, leaveTypeId, year).
//   - 'custom': an admin-defined recurring month/day (e.g. 4/1 for an Indian
//     fiscal year) the SAME for every employee under this leave type,
//     regardless of joining date — cycleKey is the calendar year the cycle
//     STARTS in (e.g. FY starting April 2026 -> key 2026), same
//     monotonically-increasing-integer trick as the other two cycle types.
//
// dateOfJoining is required for 'anniversary' — falls back to 'calendar'
// behavior if missing. customCycleStartMonth/Day are required for 'custom' —
// same calendar fallback if either is missing (shouldn't happen once
// leaveType.service.js's create/update validation is in place, but this
// mirrors 'anniversary's existing defensive fallback rather than throwing).
function resolveLeaveCycle({ cycleType, dateOfJoining, dateStr, customCycleStartMonth, customCycleStartDay }) {
  const asOf = new Date(`${dateStr}T00:00:00`);

  if (cycleType === 'custom' && customCycleStartMonth && customCycleStartDay) {
    // Anchor to the most recent occurrence of month/day on or before asOf.
    let cycleStart = new Date(asOf.getFullYear(), customCycleStartMonth - 1, customCycleStartDay);
    if (cycleStart > asOf) {
      cycleStart = new Date(asOf.getFullYear() - 1, customCycleStartMonth - 1, customCycleStartDay);
    }

    const cycleEnd = new Date(cycleStart.getFullYear() + 1, cycleStart.getMonth(), cycleStart.getDate());
    cycleEnd.setDate(cycleEnd.getDate() - 1);

    return { cycleKey: cycleStart.getFullYear(), cycleStart: dateOnly(cycleStart), cycleEnd: dateOnly(cycleEnd) };
  }

  if (cycleType !== 'anniversary' || !dateOfJoining) {
    const year = asOf.getFullYear();
    return { cycleKey: year, cycleStart: `${year}-01-01`, cycleEnd: `${year}-12-31` };
  }

  const join = new Date(`${dateOfJoining}T00:00:00`);

  // Anchor to the most recent join-day anniversary on or before asOf.
  let cycleStart = new Date(asOf.getFullYear(), join.getMonth(), join.getDate());
  if (cycleStart > asOf) {
    cycleStart = new Date(asOf.getFullYear() - 1, join.getMonth(), join.getDate());
  }
  if (cycleStart < join) cycleStart = new Date(join.getFullYear(), join.getMonth(), join.getDate());

  const cycleEnd = new Date(cycleStart.getFullYear() + 1, cycleStart.getMonth(), cycleStart.getDate());
  cycleEnd.setDate(cycleEnd.getDate() - 1);

  const cycleKey = cycleStart.getFullYear() - join.getFullYear() + 1;

  return { cycleKey, cycleStart: dateOnly(cycleStart), cycleEnd: dateOnly(cycleEnd) };
}

module.exports = { resolveLeaveCycle };
